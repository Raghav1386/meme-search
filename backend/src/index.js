import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Routes
import searchRoute from "./search.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use("/api/search", searchRoute);

import ingestionRoute from "./ingestion.js";
app.use("/api/ingestion", ingestionRoute);
import { streamB2Image } from "./image.js";
app.get("/api/image", streamB2Image);

// (Removed duplicate PORT declaration)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});