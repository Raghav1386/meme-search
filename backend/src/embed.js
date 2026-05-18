import axios from "axios";

const EMBED_URL = "http://127.0.0.1:8000/embed";

export const getEmbedding = async (text) => {
  const res = await axios.get(EMBED_URL, {
    params: { query: text },
    timeout: 10000,
  });

  return res.data.embedding;
};