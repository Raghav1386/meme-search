from fastapi import FastAPI
from transformers import CLIPProcessor, CLIPModel
import torch
import traceback

app = FastAPI()

model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")


@app.get("/embed")
def embed(query: str):
    try:
        inputs = processor(text=[query], return_tensors="pt", padding=True)

        with torch.no_grad():
            features = model.get_text_features(**inputs)

        # normalize
        features = features / features.norm(dim=-1, keepdim=True)

        emb = features.squeeze(0).cpu().numpy().astype("float32").tolist()

        return {"embedding": emb}

    except Exception as e:
        print(traceback.format_exc())
        return {"error": str(e)}