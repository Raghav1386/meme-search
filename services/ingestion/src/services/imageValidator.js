import sharp from 'sharp';

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.isTransient = false;
  }
}

/**
 * Validates an image buffer using sharp.
 * Checks format and minimum/maximum dimensions.
 * 
 * @param {Buffer} buffer 
 * @returns {Promise<{ format: string, width: number, height: number, sizeBytes: number }>}
 */
export async function validateImage(buffer) {
  if (!buffer || buffer.byteLength === 0) {
    throw new ValidationError('Image buffer is empty');
  }

  try {
    const metadata = await sharp(buffer).metadata();

    const allowedFormats = ['jpeg', 'jpg', 'png', 'webp', 'gif'];
    if (!metadata.format || !allowedFormats.includes(metadata.format.toLowerCase())) {
      throw new ValidationError(`Unsupported image format: ${metadata.format}`);
    }

    // Default reasonable dimensions (could pull from config, but hardcoding reasonable limits for MVP)
    const minWidth = 32;
    const minHeight = 32;
    const maxWidth = 10000;
    const maxHeight = 10000;

    if (!metadata.width || !metadata.height) {
      throw new ValidationError('Could not determine image dimensions');
    }

    if (metadata.width < minWidth || metadata.height < minHeight) {
      throw new ValidationError(`Image dimensions too small: ${metadata.width}x${metadata.height}`);
    }

    if (metadata.width > maxWidth || metadata.height > maxHeight) {
      throw new ValidationError(`Image dimensions too large: ${metadata.width}x${metadata.height}`);
    }

    return {
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      sizeBytes: buffer.byteLength
    };
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError(`Invalid or corrupt image: ${err.message}`);
  }
}
