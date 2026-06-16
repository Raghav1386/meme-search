from fastapi import FastAPI
from transformers import CLIPProcessor, CLIPModel
import torch

app = FastAPI()

model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

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

