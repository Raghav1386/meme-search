import B2 from 'backblaze-b2';
import dotenv from 'dotenv';
dotenv.config();

let b2Client = null;
let b2AuthPromise = null;

const getB2Client = async () => {
  if (b2Client) return b2Client;
  
  if (!b2AuthPromise) {
    b2AuthPromise = (async () => {
      const client = new B2({
        applicationKeyId: process.env.B2_KEY_ID,
        applicationKey: process.env.B2_APP_KEY
      });
      await client.authorize();
      b2Client = client;
      return client;
    })();
  }
  
  try {
    return await b2AuthPromise;
  } catch (err) {
    b2AuthPromise = null;
    throw err;
  }
};

export const streamB2Image = async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).send('Missing key');

    const client = await getB2Client();
    const response = await client.downloadFileByName({
      bucketName: process.env.B2_BUCKET_NAME,
      fileName: key,
      responseType: 'stream'
    });
    
    if (response.headers['content-type']) {
      res.setHeader('content-type', response.headers['content-type']);
    }
    response.data.pipe(res);
  } catch (err) {
    if (err.response && err.response.status === 401) {
      b2Client = null; // Token expired, reset cache
      b2AuthPromise = null; 
      return streamB2Image(req, res); // Retry once
    }
    console.error('Error fetching image:', err.message);
    const status = err.response?.status || 500;
    res.status(status).send('Error fetching image');
  }
};
