export const getB2Url = (b2_key) => {
  return `https://f000.backblazeb2.com/file/${process.env.B2_BUCKET_NAME}/${b2_key}`;
};