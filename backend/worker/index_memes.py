import os
from io import BytesIO

from dotenv import load_dotenv
import b2sdk.v2 as b2
import psycopg2
from PIL import Image
import torch
from transformers import CLIPProcessor, CLIPModel

# --------- env & config ----------

# This will load ../.env since we are in backend/worker
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")
B2_KEY_ID = os.getenv("B2_KEY_ID")
B2_APP_KEY = os.getenv("B2_APP_KEY")
B2_BUCKET_NAME = os.getenv("B2_BUCKET_NAME")

if not all([SUPABASE_DB_URL, B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME]):
    raise RuntimeError("Missing env vars; check backend/.env")

# --------- Backblaze B2 helpers ----------

def get_b2_bucket():
    info = b2.InMemoryAccountInfo()
    api = b2.B2Api(info)
    api.authorize_account("production", B2_KEY_ID, B2_APP_KEY)
    bucket = api.get_bucket_by_name(B2_BUCKET_NAME)
    return bucket

def list_b2_files(bucket, prefix="backend/memes"):
    # recursive=True walks the full tree under the prefix
    for file_version, _ in bucket.ls(folder_to_list=prefix, recursive=True):
        yield file_version.file_name

def download_b2_file(bucket, file_name: str) -> bytes:
    sink = BytesIO()
    bucket.download_file_by_name(file_name).save(sink)
    return sink.getvalue()

# --------- CLIP setup & embedding ----------

device = "cuda" if torch.cuda.is_available() else "cpu"

clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(device)
clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

def compute_image_embedding(image_bytes: bytes):
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    inputs = clip_processor(images=image, return_tensors="pt").to(device)

    with torch.no_grad():
        outputs = clip_model.get_image_features(**inputs)

        # Handle both: model output object vs plain tensor
        if hasattr(outputs, "last_hidden_state") and outputs.last_hidden_state is not None:
            features = outputs.last_hidden_state    # (1, seq_len, dim)
            features = features.mean(dim=1)         # (1, dim)
        elif hasattr(outputs, "pooler_output") and outputs.pooler_output is not None:
            features = outputs.pooler_output        # (1, dim)
        else:
            features = outputs                      # assume tensor

    emb = features.squeeze(0).cpu().numpy().astype("float32")  # (dim,)
    emb_512 = emb[:512]                                        # ensure 512 dims
    return emb_512.tolist()

def infer_format_from_name(name: str) -> str:
    n = name.lower()
    if n.endswith((".mp4", ".mov", ".webm", ".mkv")):
        return "video"
    if n.endswith(".gif"):
        return "gif"
    return "image"

# --------- Postgres helpers ----------

def get_pg_conn():
    return psycopg2.connect(SUPABASE_DB_URL)

def meme_exists(conn, b2_key: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM memes WHERE b2_key = %s LIMIT 1",
            (b2_key,),
        )
        return cur.fetchone() is not None

def insert_or_update_meme(conn, b2_key, caption, fmt, embedding):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO memes (b2_key, caption, format, embedding)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (b2_key) DO UPDATE
            SET caption  = EXCLUDED.caption,
                format   = EXCLUDED.format,
                embedding = EXCLUDED.embedding;
            """,
            (b2_key, caption, fmt, embedding),
        )
    conn.commit()

# --------- main indexing loop ----------

def main():
    bucket = get_b2_bucket()
    conn = get_pg_conn()

    # Adjust this if you want smaller/larger batches per run
    max_new_files =  None 

    processed = 0
    skipped = 0
    errors = 0

    for b2_key in list_b2_files(bucket, prefix="backend/memes"):
        try:
            # Skip if already indexed (resume-safe)
            if meme_exists(conn, b2_key):
                skipped += 1
                print(f"Skipping already indexed: {b2_key}")
                continue

            fmt = infer_format_from_name(b2_key)
            if fmt == "video":
                skipped += 1
                print(f"Skipping video for now: {b2_key}")
                continue

            print(f"Indexing {b2_key} ...")

            file_bytes = download_b2_file(bucket, b2_key)
            embedding = compute_image_embedding(file_bytes)

            caption = b2_key  # placeholder caption

            insert_or_update_meme(conn, b2_key, caption, fmt, embedding)
            processed += 1
            print(f"Done: {b2_key}")

            if max_new_files is not None and processed >= max_new_files:
                print("Reached batch limit, stopping safely.")
                break

        except Exception as e:
            errors += 1
            print(f"Error processing {b2_key}: {e}")

    conn.close()
    print(f"New indexed: {processed}, skipped: {skipped}, errors: {errors}")

if __name__ == "__main__":
    main()
