
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

## Troubleshooting: Facebook Login "App not active" Error

If you see an error saying **"App not active: This app is not currently accessible..."** when trying to use Facebook Login in production (like on your Render deployment), it means your Facebook App is still in "Development" mode. 

By default, only the app creator can log in while in Development mode.

**Step-by-Step Fix:**
1. Log in to the [Meta for Developers Dashboard](https://developers.facebook.com/apps/) and click on your specific Meme Search app.
2. In the left-hand menu, navigate to **App Settings > Basic**.
3. Facebook requires you to provide a **Privacy Policy URL** and **Data Deletion Instructions URL** before going live. Add your deployed Render URL here (e.g., `https://your-app.onrender.com/privacy`).
4. Look at the very top header of the dashboard for the **App Mode** toggle switch. 
5. Click the toggle to switch it from **Development** to **Live**.
6. Test your login again on your deployed site. The error will immediately disappear for all users!
