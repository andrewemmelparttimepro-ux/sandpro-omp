const NCR_IMAGE_MIME_BY_EXTENSION = Object.freeze({
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  webp: 'image/webp',
});

export const NCR_IMAGE_PREVIEW_TRANSFORM = Object.freeze({
  width: 1200,
  resize: 'contain',
  quality: 82,
});

const getNcrFileExtension = (file = {}) => {
  const value = String(file.name || file.url || '').split('?')[0];
  const match = value.match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() || '';
};

export const getNcrFileMimeType = (file = {}) => {
  const explicit = String(file.mimeType || file.mime_type || file.type || '').trim().toLowerCase();
  const fromExtension = NCR_IMAGE_MIME_BY_EXTENSION[getNcrFileExtension(file)] || '';
  if (!explicit || explicit === 'application/octet-stream') {
    return fromExtension || explicit || 'application/octet-stream';
  }
  return explicit;
};

export const isNcrImageAttachment = (file = {}) => (
  getNcrFileMimeType(file).startsWith('image/')
  || Boolean(NCR_IMAGE_MIME_BY_EXTENSION[getNcrFileExtension(file)])
);
