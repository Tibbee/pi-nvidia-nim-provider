/**
 * Default provider-level configuration for NVIDIA NIM.
 */

/** NVIDIA NIM API base URL (OpenAI-compatible). */
export const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";

/** Environment variable name for the NVIDIA API key. */
export const NIM_API_KEY_ENV = "NVIDIA_API_KEY";

/**
 * Model ID patterns for filtering LLMs from the /v1/models endpoint
 * during dynamic model discovery.
 */
export const LLM_PATTERNS: RegExp[] = [
  // Major LLM providers
  /^deepseek-ai\//,
  /^qwen\//,
  /^z-ai\//,
  /^meta\/llama/,
  /^mistralai\//,
  /^minimaxai\//,
  /^moonshotai\//,
  /^openai\/gpt-oss/,
  /^google\/gemma/,
  /^microsoft\/phi/,
  /^bytedance\//,
  /^stepfun-ai\//,
  /^abacusai\//,
  /^sarvamai\//,
  /^upstage\//,
  /^stockmark\//,
  /^writer\//,
  /^ibm\/granite/,
  /^ai21labs\//,
  /^01-ai\//,
  /^nvidia\/llama-3\.\d-nemotron/,
  /^nvidia\/nvidia-nemotron-nano/,
  /^nvidia\/nemotron-4-340b-instruct/,
  /^nvidia\/nemotron-3-super/,
  /^nvidia\/nemotron-mini/,
  /^nvidia\/llama3-chatqa/,
  /^nvidia\/nemotron-nano-12b/,
  /^nvidia\/llama-3\.1-nemotron-nano-vl/,
  /^nv-mistralai\//,
  /^databricks\//,
  /^zyphra\//,
  /^baichuan-inc\//,
  /^thudm\//,
  /^tiiuae\//,
  /^aisingapore\//,
  /^mediatek\//,
  /^snowflake\//,
];

/**
 * Model ID patterns to EXCLUDE even if they match an LLM_PATTERNS entry.
 */
export const EXCLUDE_PATTERNS: RegExp[] = [
  // Safety / guardrails
  /guard/i,
  /safety/i,
  /jailbreak/i,
  /pii/i,
  /content-safety/i,

  // Embeddings / reranking
  /embed/i,
  /rerank/i,

  // ASR / TTS / speech
  /asr/i,
  /tts/i,
  /parakeet/i,
  /conformer/i,
  /whisper/i,
  /canary/i,
  /magpie/i,
  /riva-translate/i,
  /voicechat/i,
  /studiovoice/i,

  // OCR / Doc intelligence
  /nemoretriever/i,
  /nemotron-parse/i,
  /nemotron-ocr/i,
  /paddleocr/i,
  /page-elements/i,
  /table-structure/i,
  /graphic-elements/i,

  // Image generation / vision processing
  /FLUX/i,
  /stable-diffusion/i,
  /cosmos-transfer/i,
  /cosmos-predict/i,
  /TRELLIS/i,
  /fuyu/i,
  /kosmos/i,
  /deplot/i,
  /paligemma/i,
  /neva/i,
  /shieldgemma/i,

  // Science / biology
  /alphafold/i,
  /esm/i,
  /protein/i,
  /rfdiffusion/i,
  /openfold/i,
  /boltz/i,
  /diffdock/i,
  /genmol/i,
  /molmim/i,
  /msa-search/i,
  /evo/i,

  // Autonomous vehicles
  /bevformer/i,
  /sparsedrive/i,
  /streampetr/i,

  // Video / non-LLM vision
  /cosmos-reason/i,
  /synthetic-video/i,
  /Active Speaker/i,
  /LipSync/i,
  /Background Noise/i,
  /eyecontact/i,
  /vista-3d/i,
  /nvclip/i,

  // Other non-LLM
  /ising/i,
  /fourcastnet/i,
  /cuopt/i,
  /usdcode/i,
  /usdvalidate/i,
  /arctic-embed/i,
  /reward/i,

  // Legacy / base models (not instruction-tuned for chat)
  /mistral-nemo-minitron-8b-base/i,
  /mamba-codestral/i,
  /mathstral/i,
  /mixtral-8x22b-v0\.1$/i,  // base (non-instruct) version
  /gemma-2b$/i,             // base Gemma 2B (not -it)
  /gemma-7b$/i,             // base Gemma 7B (not -it)
  /codegemma/i,             // code-only, not chat
  /codellama/i,             // code-only, not chat
  /llama2-70b/i,            // too old
  /starcoder/i,             // code-only
  /granite-34b-code/i,
  /granite-8b-code/i,
  /granite-3\.0-3b/i,
  /vila/i,
  /breeze-7b/i,
  /falcon3/i,
  /chatglm3/i,
  /baichuan2/i,
  /usdcode-llama/i,
  /nemotron-4-mini-hindi/i,
  /sea-lion/i,
];
