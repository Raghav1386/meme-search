import axios from "axios";

const EMBED_URL = "http://127.0.0.1:8000/embed";

export const getEmbedding = async (text) => {
  const res = await axios.get(EMBED_URL, {
    params: { query: text },

  });

  console.log("PYTHON RESPONSE:", res.data); // 👈 DEBUG

  if (!res.data || !res.data.embedding) {
    throw new Error("Embedding API failed: " + JSON.stringify(res.data));
  }





  return res.data.embedding;
};