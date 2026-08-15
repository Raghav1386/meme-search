from typing import Optional
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
from transformers import CLIPProcessor, CLIPModel
import torch
from index_memes import index_single_meme, index_all_memes

app = FastAPI(title="Meme Search Worker API", description="Embedding & Auto-Ingestion Pipeline API")

model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

class IndexMemeRequest(BaseModel):
    b2_key: str
    caption: Optional[str] = None
    force_reindex: bool = False

class IndexBatchRequest(BaseModel):
    prefix: str = "backend/memes"
    force_reindex: bool = False
    max_files: Optional[int] = None

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/embed")
def embed(query: str):
    inputs = processor(text=[query], return_tensors="pt", padding=True)

    with torch.no_grad():
        outputs = model.get_text_features(**inputs)

        # In some versions of Transformers, get_text_features returns a BaseModelOutputWithPooling.
        # We need to extract the actual embeddings (the pooler_output) which is a tensor.
        features = outputs if isinstance(outputs, torch.Tensor) else outputs.pooler_output

    # ✅ normalize OUTSIDE (to be safe)
    features = features / features.norm(dim=-1, keepdim=True)

    emb = features[0].cpu().numpy().astype("float32").tolist()

    return {"embedding": emb}

@app.post("/index-meme")
def index_meme_endpoint(req: IndexMemeRequest):
    """
    On-demand endpoint called by auto-ingestion pipeline whenever a new meme
    is uploaded to Backblaze B2.
    """
    try:
        res = index_single_meme(
            b2_key=req.b2_key,
            custom_caption=req.caption,
            force_reindex=req.force_reindex
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/index-batch")
def index_batch_endpoint(req: IndexBatchRequest, background_tasks: BackgroundTasks):
    """
    Triggers a background indexing task to scan B2 for unindexed memes.
    """
    background_tasks.add_task(
        index_all_memes,
        prefix=req.prefix,
        force_reindex=req.force_reindex,
        max_files=req.max_files
    )
    return {
        "status": "accepted",
        "message": "Batch indexing task dispatched to background",
        "prefix": req.prefix
    }


