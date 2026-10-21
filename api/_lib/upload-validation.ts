export const MAX_PDF_BYTES = 300 * 1024 * 1024;
export const PDF_PART_SIZE = 8 * 1024 * 1024;
export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

export function validatePdfUpload(input: {
  filename: unknown;
  contentType: unknown;
  size: unknown;
}): string | null {
  if (
    typeof input.filename !== 'string' ||
    input.filename.length > 200 ||
    !input.filename.trim().toLowerCase().endsWith('.pdf') ||
    input.contentType !== 'application/pdf' ||
    !Number.isSafeInteger(input.size) ||
    Number(input.size) <= 0 ||
    Number(input.size) > MAX_PDF_BYTES
  ) {
    return 'Choose a PDF file no larger than 300 MB.';
  }

  return null;
}

export function validateThumbnailUpload(input: {
  contentType: unknown;
  size: unknown;
}): string | null {
  if (
    (input.contentType !== 'image/jpeg' &&
      input.contentType !== 'image/png' &&
      input.contentType !== 'image/webp') ||
    !Number.isSafeInteger(input.size) ||
    Number(input.size) <= 0 ||
    Number(input.size) > MAX_THUMBNAIL_BYTES
  ) {
    return 'Choose a JPEG, PNG, or WebP thumbnail no larger than 5 MB.';
  }

  return null;
}

export function matchesThumbnailSignature(
  contentType: string,
  bytes: Uint8Array,
): boolean {
  if (contentType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (contentType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }

  if (contentType === 'image/webp') {
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 &&
      bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 &&
      bytes[10] === 0x42 && bytes[11] === 0x50
    );
  }

  return false;
}
