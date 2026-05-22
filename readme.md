
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

**Step 3: Run the Development Server**
Start the frontend application locally using Vite:
```bash
npm run dev
```
