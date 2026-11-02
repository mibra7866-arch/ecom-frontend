const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg', '.avif', '.heic', '.tiff', '.ico']);

/**
 * The backend accepts any image content-type regardless of extension (see FileValidationRules'
 * AllowAnyImage), so this is a best-effort check against common image extensions purely to decide
 * "show an inline preview vs. a plain file link" — not a security/validation boundary, that's already
 * enforced server-side at upload time. Shared by every place that renders an uploaded file (chat
 * attachments, KYC documents, withdrawal/top-up receipts, ...) so they all agree on what counts as an
 * image instead of each carrying a slightly different regex/extension list.
 */
export function isImageUrl(url: string): boolean {
  const extension = url.slice(url.lastIndexOf('.')).toLowerCase();
  return IMAGE_EXTENSIONS.has(extension);
}
