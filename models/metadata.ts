// Back-compat shim; registry owns the real metadata logic.
export {
  buildReasoningEffortThinkingLevelMap,
  getAllMetadata,
  getModelMetadata,
  hasMetadata,
  mapThinkingFormatToCompat,
} from "./registry";
