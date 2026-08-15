import os
import sys
import time
from io import BytesIO

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

from dotenv import load_dotenv
import b2sdk.v2 as b2
import psycopg2
from PIL import Image
import torch
import numpy as np
from transformers import CLIPProcessor, CLIPModel
import easyocr

# --------- env & config ----------

# Load ../.env since we are in backend/worker
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

NEON_DATABASE_URL = os.getenv("NEON_DATABASE_URL")
B2_KEY_ID = os.getenv("B2_KEY_ID")
B2_APP_KEY = os.getenv("B2_APP_KEY")
B2_BUCKET_NAME = os.getenv("B2_BUCKET_NAME")

# Suppress HuggingFace unauthenticated warnings if HF_API_KEY is available
if not os.getenv("HF_TOKEN") and os.getenv("HF_API_KEY"):
    os.environ["HF_TOKEN"] = os.getenv("HF_API_KEY")

if not all([NEON_DATABASE_URL, B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME]):
    raise RuntimeError("Missing env vars; check backend/.env")

# --------- Backblaze B2 helpers ----------

def get_b2_bucket(max_retries: int = 4, initial_delay: float = 2.0):
    last_err = None
    delay = initial_delay
    for attempt in range(1, max_retries + 1):
        try:
            info = b2.InMemoryAccountInfo()
            api = b2.B2Api(info)
            api.authorize_account("production", B2_KEY_ID, B2_APP_KEY)
            bucket = api.get_bucket_by_name(B2_BUCKET_NAME)
            return bucket
        except Exception as e:
            last_err = e
            print(f"B2 auth attempt {attempt}/{max_retries} failed: {e}")
            if attempt < max_retries:
                time.sleep(delay)
                delay *= 2
    raise RuntimeError(f"Failed B2 auth after {max_retries} attempts: {last_err}")

def list_b2_files(bucket, prefix="backend/memes"):
    for file_version, _ in bucket.ls(folder_to_list=prefix, recursive=True):
        yield file_version.file_name

def download_b2_file(bucket, file_name: str, max_retries: int = 3) -> bytes:
    last_err = None
    for attempt in range(1, max_retries + 1):
        try:
            sink = BytesIO()
            bucket.download_file_by_name(file_name).save(sink)
            return sink.getvalue()
        except Exception as e:
            last_err = e
            if attempt < max_retries:
                time.sleep(1.5 * attempt)
    raise last_err

# --------- CLIP setup & embedding ----------

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Using device: {device}")

clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(device)
clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

# EasyOCR setup
print("Initializing EasyOCR reader...")
ocr_reader = easyocr.Reader(['en'], gpu=torch.cuda.is_available(), verbose=False)


def compute_image_embedding(image_bytes: bytes):
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    inputs = clip_processor(images=image, return_tensors="pt").to(device)

    with torch.no_grad():
        outputs = clip_model.get_image_features(**inputs)
        if isinstance(outputs, torch.Tensor):
            features = outputs
        else:
            features = outputs.pooler_output

        features = features / features.norm(dim=-1, keepdim=True)

    emb = features.squeeze(0).cpu().numpy().astype("float32")
    emb_512 = emb[:512]
    return emb_512.tolist()

def extract_ocr_text(image_bytes: bytes) -> str:
    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        img_np = np.array(image)
        results = ocr_reader.readtext(img_np, detail=0)
        return " ".join(results).strip()
    except Exception as e:
        print(f"OCR error: {e}")
        return ""

def extract_caption_from_b2_key(b2_key: str) -> str:
    filename = os.path.basename(b2_key)
    name_without_ext = os.path.splitext(filename)[0]
    clean_caption = name_without_ext.replace('_', ' ').replace('-', ' ').strip()
    return clean_caption

def infer_format_from_name(name: str) -> str:
    n = name.lower()
    if n.endswith((".mp4", ".mov", ".webm", ".mkv")):
        return "video"
    if n.endswith(".gif"):
        return "gif"
    return "image"

# --------- Postgres helpers & Migration ----------

def get_pg_conn():
    return psycopg2.connect(NEON_DATABASE_URL)

def ensure_pg_conn(conn):
    """Checks if database connection is alive; reconnects if connection was closed or dropped."""
    try:
        if conn is None or conn.closed != 0:
            return get_pg_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT 1;")
        return conn
    except Exception:
        try:
            conn.close()
        except Exception:
            pass
        return get_pg_conn()

def run_db_migration(conn):
    print("Running DB migration for hybrid search...")
    sql_path = os.path.join(os.path.dirname(__file__), "..", "sql", "match_memes.sql")
    if os.path.exists(sql_path):
        with open(sql_path, "r", encoding="utf-8") as f:
            migration_sql = f.read()
        with conn.cursor() as cur:
            cur.execute(migration_sql)
        conn.commit()
        print("DB migration applied successfully.")
    else:
        print(f"Warning: Migration file not found at {sql_path}")

def meme_needs_indexing(conn, b2_key: str, force_reindex: bool = False) -> bool:
    if force_reindex:
        return True
    with conn.cursor() as cur:
        cur.execute(
            "SELECT ocr_text FROM memes WHERE b2_key = %s LIMIT 1",
            (b2_key,),
        )
        row = cur.fetchone()
        if row is None:
            return True  # Not indexed yet
        # Re-index if ocr_text is None (needs updated indexing)
        return row[0] is None

def insert_or_update_meme(conn, b2_key, caption, ocr_text, fmt, embedding):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO memes (b2_key, caption, ocr_text, format, embedding)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (b2_key) DO UPDATE
            SET caption   = EXCLUDED.caption,
                ocr_text  = EXCLUDED.ocr_text,
                format    = EXCLUDED.format,
                embedding = EXCLUDED.embedding;
            """,
            (b2_key, caption or "", ocr_text or "", fmt, embedding),
        )
    conn.commit()

# --------- Single & Batch Indexing Core Logic ----------

def index_single_meme(b2_key: str, custom_caption: str = None, force_reindex: bool = False, bucket=None, conn=None) -> dict:
    if bucket is None:
        bucket = get_b2_bucket()
    if conn is None:
        conn = get_pg_conn()
    else:
        conn = ensure_pg_conn(conn)

    if not meme_needs_indexing(conn, b2_key, force_reindex=force_reindex):
        return {
            "status": "skipped",
            "message": "Meme already indexed",
            "b2_key": b2_key
        }

    fmt = infer_format_from_name(b2_key)
    if fmt == "video":
        return {
            "status": "skipped",
            "message": "Video indexing currently unsupported",
            "b2_key": b2_key
        }

    file_bytes = download_b2_file(bucket, b2_key)
    embedding = compute_image_embedding(file_bytes)
    ocr_text = extract_ocr_text(file_bytes)
    caption = custom_caption if custom_caption else extract_caption_from_b2_key(b2_key)

    insert_or_update_meme(conn, b2_key, caption, ocr_text, fmt, embedding)

    return {
        "status": "success",
        "b2_key": b2_key,
        "caption": caption,
        "ocr_text": ocr_text,
        "format": fmt,
        "embedding_dimensions": len(embedding) if embedding else 0
    }

def index_all_memes(prefix: str = "backend/memes", force_reindex: bool = False, max_files: int = None) -> dict:
    bucket = get_b2_bucket()
    conn = get_pg_conn()
    run_db_migration(conn)

    processed = 0
    skipped = 0
    errors = 0

    print(f"Starting batch indexing (prefix={prefix}, force_reindex={force_reindex})...")

    for b2_key in list_b2_files(bucket, prefix=prefix):
        try:
            conn = ensure_pg_conn(conn)
            res = index_single_meme(b2_key, force_reindex=force_reindex, bucket=bucket, conn=conn)
            if res.get("status") == "success":
                processed += 1
            else:
                skipped += 1

            if max_files is not None and processed >= max_files:
                break
        except Exception as e:
            errors += 1
            print(f"Error processing {b2_key}: {e}")

    try:
        conn.close()
    except Exception:
        pass

    return {
        "status": "complete",
        "processed": processed,
        "skipped": skipped,
        "errors": errors
    }

# --------- main indexing loop ----------

def main():
    force_reindex = "--force" in sys.argv or os.getenv("FORCE_REINDEX", "false").lower() in ("true", "1")
    result = index_all_memes(prefix="backend/memes", force_reindex=force_reindex)
    print(f"Indexing complete! Processed: {result['processed']}, Skipped: {result['skipped']}, Errors: {result['errors']}")

if __name__ == "__main__":
    main()

