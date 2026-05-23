FROM python:3.11-slim

WORKDIR /app

# Copy the requirements file
COPY backend/worker/requirements.txt .

# Remove torch and torchvision from requirements.txt because we will install the CPU version manually
RUN grep -v -E "torch|torchvision" requirements.txt > requirements_clean.txt

# Install CPU version of PyTorch to save space and memory (otherwise it installs 2.5GB+ of GPU drivers)
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Install the rest of the requirements
RUN pip install --no-cache-dir -r requirements_clean.txt

# Pre-download the HuggingFace model weights into the Docker image
# This prevents the server from timing out on startup while downloading 600MB of weights
RUN python -c "from transformers import CLIPProcessor, CLIPModel; CLIPModel.from_pretrained('openai/clip-vit-base-patch32'); CLIPProcessor.from_pretrained('openai/clip-vit-base-patch32')"

# Copy the python worker files
COPY backend/worker ./backend/worker

# Start the FastAPI server using the PORT provided by Railway
CMD ["sh", "-c", "cd backend/worker && uvicorn test:app --host 0.0.0.0 --port ${PORT:-8000}"]
