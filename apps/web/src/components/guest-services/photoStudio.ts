/** Force 1:1 crop + compress for staff dish photos. */
export async function studioProcessImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file');
  }
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = Math.floor((bitmap.width - side) / 2);
  const sy = Math.floor((bitmap.height - side) / 2);
  const size = Math.min(800, side);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process image');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();
  const mime = file.type.includes('png') ? 'image/png' : 'image/jpeg';
  const dataUrl = canvas.toDataURL(mime, 0.82);
  if (dataUrl.length > 1_600_000) {
    return canvas.toDataURL('image/jpeg', 0.7);
  }
  return dataUrl;
}
