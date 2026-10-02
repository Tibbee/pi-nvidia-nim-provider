// Lightweight syntax/container checks, not a full pixel decoder.
// Reject malformed base64 and obvious truncation before exposing/saving images.

/** Detect the actual image format from magic bytes; never assume PNG or JPEG. */
export function detectImageMime(bytes: Uint8Array | Buffer): string | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return undefined;
}

export const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function decodeImageBase64(data: string): Buffer | undefined {
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 === 1 ||
      (data.includes("=") && data.length % 4 !== 0)) return undefined;
  const bytes = Buffer.from(data, "base64");
  return bytes.length && bytes.toString("base64").replace(/=+$/, "") === data.replace(/=+$/, "")
    ? bytes : undefined;
}

export function hasCompleteImageStructure(bytes: Buffer, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8 ||
        bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) return false;
    let offset = 2;
    let hasFrame = false;
    while (offset < bytes.length - 2) {
      if (bytes[offset++] !== 0xff) return false;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === undefined || offset + 2 > bytes.length) return false;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length - 2) return false;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8 || !bytes.readUInt16BE(offset + 3) || !bytes.readUInt16BE(offset + 5)) return false;
        hasFrame = true;
      }
      if (marker === 0xda) return hasFrame && length >= 6 && offset + length < bytes.length - 2;
      offset += length;
    }
    return false;
  }
  if (mimeType === "image/png") {
    if (bytes.length < 45 || bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a") return false;
    let offset = 8;
    let hasHeader = false;
    let hasData = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      const end = offset + 12 + length;
      if (end > bytes.length) return false;
      if (!hasHeader) {
        if (type !== "IHDR" || length !== 13 || !bytes.readUInt32BE(offset + 8) ||
            !bytes.readUInt32BE(offset + 12)) return false;
        hasHeader = true;
      } else if (type === "IHDR") return false;
      if (type === "IDAT" && length > 0) hasData = true;
      if (type === "IEND") return length === 0 && hasData && end === bytes.length;
      offset = end;
    }
    return false;
  }
  if (mimeType === "image/webp") {
    if (bytes.length < 26 || bytes.toString("ascii", 0, 4) !== "RIFF" ||
        bytes.toString("ascii", 8, 12) !== "WEBP" || bytes.readUInt32LE(4) + 8 !== bytes.length) return false;
    let offset = 12;
    let hasImage = false;
    while (offset + 8 <= bytes.length) {
      const type = bytes.toString("ascii", offset, offset + 4);
      const length = bytes.readUInt32LE(offset + 4);
      const data = offset + 8;
      const end = data + length + (length % 2);
      if (end > bytes.length) return false;
      if (type === "VP8 ") {
        if (length < 10 || bytes.toString("hex", data + 3, data + 6) !== "9d012a" ||
            !(bytes.readUInt16LE(data + 6) & 0x3fff) || !(bytes.readUInt16LE(data + 8) & 0x3fff)) return false;
        hasImage = true;
      }
      if (type === "VP8L") {
        if (length < 5 || bytes[data] !== 0x2f) return false;
        hasImage = true;
      }
      offset = end;
    }
    return hasImage && offset === bytes.length;
  }
  return false;
}
