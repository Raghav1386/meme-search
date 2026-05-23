
# Frontend Architecture & Setup Guide

## Frontend Components
The frontend of this project is built using the following React components:
- `BackgroundCanvas` (src/components/BackgroundCanvas.jsx)
- `Home` (src/components/Home.jsx)
- `MemeSearch` (src/components/MemeSearch.jsx)
- `Typewriter` (src/components/Typewriter.jsx)
- `login` (src/components/login.jsx)
- `memeResult` (src/components/memeResult.jsx)
- `sidebar` (src/components/sidebar.jsx)

## Dependencies Setup
Follow these steps to install the required dependencies to run the frontend of this website:

**Step 1: Install Core Dependencies**
These are required for the main functionality, animations, routing, and UI:
```bash
npm install framer-motion iconify-icon react react-dom react-router-dom
```

**Step 2: Install Development Dependencies**
These are required for the build process, styling (Tailwind CSS), and the Vite development server:
```bash
npm install -D @vitejs/plugin-react autoprefixer postcss tailwindcss vite @types/react @types/react-dom
```

**Step 3: Run the Frontend Development Server**
Start the frontend application locally using Vite:
```bash
cd frontend
npm run dev
```

**Step 4: Run the Backend API Server**
Start the Node.js backend server:
```bash
cd backend
npm run dev
```

**Step 5: Run the Python Embedding Worker**
Start the FastAPI worker for clip embeddings (runs on port 8000):
```bash
cd backend/worker
uvicorn test:app --host 127.0.0.1 --port 8000
```

Alternatively, you can run all of them at the same time with a single command from the root directory:
```bash
npx concurrently "npm --prefix frontend run dev" "npm --prefix backend run dev" "cd backend/worker && uvicorn test:app --host 127.0.0.1 --port 8000"
```
