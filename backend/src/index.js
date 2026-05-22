import express from "express";
import dotenv from "dotenv";
import searchRoute from "./search.js";

dotenv.config();

const app = express();
app.use(express.json());

app.use("/api/search", searchRoute);

import { streamB2Image } from "./image.js";
app.get("/api/image", streamB2Image);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});