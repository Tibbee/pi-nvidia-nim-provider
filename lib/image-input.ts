// Reference-image validation and bounded local reads. Never fetch remote URLs,
// resize/re-encode the source, or print paths, image bytes, or provider payloads.
import { open, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { ImageContent } from "@earendil-works/pi-ai";
import { decodeImageBase64, detectImageMime, hasCompleteImageStructure } from "./image-bytes";
import { getNimImageEditingError, type NimImageModelCapability } from "../models/image-models";

/** Local memory/upload safety budget, NOT a documented NVIDIA limit. */
export const MAX_NIM_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;

export function validateNimReferenceImage(image: ImageContent, capability: NimImageModelCapability): string | undefined {
  const limits = capability.imageInputLimits;
  if (!limits) return "Reference-image limits are not configured for this model.";
  const maxBytes = Math.min(limits.maxBytes, MAX_NIM_REFERENCE_IMAGE_BYTES);
  if (typeof image.data !== "string" || image.data.length > Math.ceil(maxBytes / 3) * 4) {
    return "Reference image exceeds the configured byte limit or has invalid data.";
  }
  const bytes = decodeImageBase64(image.data);
  if (!bytes || bytes.length > maxBytes) return "Invalid or oversized reference-image base64.";
  const detected = detectImageMime(bytes);
  if (!detected || image.mimeType !== detected || !limits.mimeTypes.includes(detected)) {
    return "Reference-image MIME type is unsupported or does not match its bytes.";
  }
  if (!hasCompleteImageStructure(bytes, detected)) return "Reference image is truncated or malformed.";
  return undefined;
}

/** Used by the tool; explicit unverified transport access belongs to opt-in probes only. */
export async function readNimReferenceImage(
  inputPath: string,
  cwd: string,
  capability: NimImageModelCapability,
  signal?: AbortSignal,
  allowUnverifiedEditing = false,
): Promise<ImageContent> {
  const editingError = getNimImageEditingError(capability, allowUnverifiedEditing);
  if (editingError) throw new Error(editingError);
  if (typeof inputPath !== "string" || !inputPath.trim() || /^[a-z][a-z0-9+.-]*:\/\//i.test(inputPath) || /^data:/i.test(inputPath)) {
    throw new Error("inputImage must be a local file path, not a URL or inline image data.");
  }
  signal?.throwIfAborted();
  const path = resolve(cwd, inputPath);
  const maxBytes = Math.min(capability.imageInputLimits!.maxBytes, MAX_NIM_REFERENCE_IMAGE_BYTES);
  // Reject special files before opening (e.g. a FIFO whose open could block).
  const before = await stat(path);
  signal?.throwIfAborted();
  if (!before.isFile() || before.size < 1 || before.size > maxBytes) {
    throw new Error("Reference image must be a non-empty regular file within the configured byte limit.");
  }
  const file = await open(path, "r");
  try {
    signal?.throwIfAborted();
    const info = await file.stat();
    if (!info.isFile() || info.size < 1 || info.size > maxBytes) throw new Error("Invalid or oversized reference-image file.");
    // Bounded reads remain safe if the file grows between stat and reading.
    const buffer = Buffer.alloc(Math.min(info.size + 1, maxBytes + 1));
    let total = 0;
    while (total < buffer.length) {
      signal?.throwIfAborted();
      const { bytesRead } = await file.read(buffer, total, buffer.length - total, null);
      signal?.throwIfAborted();
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total !== info.size) throw new Error("Reference image changed while reading; retry with a stable file.");
    const bytes = buffer.subarray(0, total);
    const image: ImageContent = { type: "image", data: bytes.toString("base64"), mimeType: detectImageMime(bytes) ?? "" };
    const error = validateNimReferenceImage(image, capability);
    if (error) throw new Error(error);
    return image;
  } finally { await file.close(); }
}
