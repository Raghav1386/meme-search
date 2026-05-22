export const getB2Url = (b2_key) => {
  const baseUrl = process.env.B2_DOWNLOAD_URL || "https://f005.backblazeb2.com";
  return `${baseUrl}/file/${process.env.B2_BUCKET_NAME}/${b2_key}`;
};