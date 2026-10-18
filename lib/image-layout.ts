import type { NimImageModelCapability } from "../models/image-models";

export interface NimImageLayoutElement {
  id: string;
  /** [top, left, bottom, right] in normalized 0..1000 coordinates. */
  bbox: [number, number, number, number];
  desc: string;
}

// Local input/schema limit, not a claimed NVIDIA model limit. The compiled
// prompt must also fit the selected model's independent character budget.
export const MAX_LAYOUT_ELEMENTS = 20;

/** BFL layout conditioning lives in prompt. Never send a new provider field. */
export function compileNimImageLayout(
  capability: NimImageModelCapability,
  caption: string,
  raw: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: caption };
  if (capability.promptLayout?.format !== "bfl-caption-json" || !capability.promptLayout.generationVerifiedAt) {
    return { ok: false, error: `Structured layout guidance is not verified for ${capability.modelId}. Use FLUX 3 Image Klein.` };
  }
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_LAYOUT_ELEMENTS) {
    return { ok: false, error: `\`layout\` must contain 1-${MAX_LAYOUT_ELEMENTS} elements (local tool limit).` };
  }
  const seen = new Set<string>();
  const elements: NimImageLayoutElement[] = [];
  for (const [index, value] of raw.entries()) {
    const label = `layout[${index}]`;
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some(key => !["id", "bbox", "desc"].includes(key))) {
      return { ok: false, error: `${label} must be an object with only id, bbox and desc.` };
    }
    const { id, bbox, desc } = value as Record<string, unknown>;
    if (typeof id !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(id) || seen.has(id)) {
      return { ok: false, error: `${label}.id must be unique, start with a lowercase letter and contain only lowercase letters, digits or underscores (maximum 64 characters).` };
    }
    if (!caption.includes(`<${id}>`)) return { ok: false, error: `Prompt must name layout element <${id}> explicitly.` };
    if (!Array.isArray(bbox) || bbox.length !== 4 ||
        !Array.from(bbox).every(n => Number.isSafeInteger(n) && n >= 0 && n <= 1000) ||
        bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) {
      return { ok: false, error: `${label}.bbox must be [top,left,bottom,right], integers 0-1000 with top < bottom and left < right.` };
    }
    if (typeof desc !== "string" || !desc.trim()) return { ok: false, error: `${label}.desc must be non-empty text.` };
    seen.add(id);
    elements.push({ id, bbox: [...bbox] as NimImageLayoutElement["bbox"], desc });
  }
  // Preserve caption, descriptions and row order. No LLM rewrite, clipping,
  // sorting, automatic tagging or truncation. Prompt length is checked by caller.
  return { ok: true, value: `${caption} ${JSON.stringify(elements)}` };
}
