export function cleanGalleryTitle(rawName?: string | null): string {
  if (!rawName) return '';
  return rawName
    .trim()
    .replace(/\.(png|jpe?g|webp|gif|avif|svg)$/i, '')
    .trim();
}
