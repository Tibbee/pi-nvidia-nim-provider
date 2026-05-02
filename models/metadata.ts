// Back-compat shim; registry owns the real metadata logic.
export {
  applyMetadata,
  applyMetadataToModels,
  buildReasoningEffortThinkingLevelMap,
  getAllMetadata,
  getModelMetadata,
  hasMetadata,
  mapThinkingFormatToCompat,
} from "./registry";
