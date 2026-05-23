import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

let b2AuthCache = null;

const authorizeB2 = async () => {
  if (b2AuthCache) return b2AuthCache;
  const token = Buffer.from(`${process.env.B2_KEY_ID}:${process.env.B2_APP_KEY}`).toString('base64');
  const res = await axios.get('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: { Authorization: `Basic ${token}` }
  });
  b2AuthCache = {
    authorizationToken: res.data.authorizationToken,
    downloadUrl: res.data.downloadUrl,
  };
  return b2AuthCache;
};

export const streamB2Image = async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).send('Missing key');

    const auth = await authorizeB2();
    // Encode the key parts but keep the slashes so Backblaze can find the folders
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    const url = `${auth.downloadUrl}/file/${process.env.B2_BUCKET_NAME}/${encodedKey}`;
    
    const response = await axios.get(url, {
      headers: { Authorization: auth.authorizationToken },
      responseType: 'stream'
    });
    
    if (response.headers['content-type']) {
      res.setHeader('content-type', response.headers['content-type']);
    }
    response.data.pipe(res);
  } catch (err) {
    if (err.response && err.response.status === 401) {
      b2AuthCache = null; // Token expired, reset cache
      return streamB2Image(req, res); // Retry once
    }
    console.error('Error fetching image:', err.message);
    res.status(500).send('Error fetching image');
  }
};
