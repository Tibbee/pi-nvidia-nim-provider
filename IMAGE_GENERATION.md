# Hosted image generation: evidence and safe probing

## Current resolution policy (1.14.0)

Generation accepts independent width and height values from **512 through 1568 inclusive**, in **16-pixel increments**, defaulting to 1024 per axis. Both lists were extracted from actual hosted validator responses; these are not inferred container bounds. The old six-pair whitelist has been removed for generation. No automatic rounding, cropping, or resizing occurs. Existing ratio aliases are unchanged, and conflicting explicit dimensions fail locally.

The height confirmation used one approved request (`width=1024, height=1000`), which returned 422 with all 67 allowed heights. Evidence: `tools/output/images/klein-height-validator-1790976162469-94e2d682.json`. The earlier width report is linked below. This proves axis admission rules, not successful generation at every combination or absence of additional joint constraints; upstream errors remain structured, with no automatic retry.

The preset-0 square-only gate and arbitrary-upload restrictions are unchanged. Older version sections below describe historical evidence/policies, not the current generation whitelist.

## Source precedence and scope

Do not conflate upstream model capabilities, self-hosted NIM container APIs, NVIDIA hosted previews, and actual live observations. A downloadable container OpenAPI document does not establish hosted-preview transport or bounds. Even hosted schemas can contradict live behavior (Klein guidance is the known example).

Runtime records in `models/image-models.ts` identify their hosted schema, successful-generation date, conservative settings, and disagreements. Unknown bounds remain absent rather than invented. Catalog conversion requires generation evidence and an implemented transport. `metadata.json` remains generated chat-only data.

The shared client supports per-model numeric enums/ranges, inclusive/exclusive bounds, multiples, defaults, allowed dimension pairs, ratio mappings, prompt limits, required fields, and request-field filtering. It rejects unimplemented input transports rather than ignoring image blocks. Strict data-URL array/string transports and bounded local-file input are implemented, but catalog registration additionally requires successful editing evidence, accepted image fields, and configured input limits. Klein remains text-only: no arbitrary-image editing succeeded. Asset-ID and generic native preset-only image-block transports remain unimplemented. A separate, evidence-gated `preset_example` selector supports Klein's verified predefined reference without claiming arbitrary image input.

## Evidence reviewed 2026-10-02

| Model | Hosted evidence | Operational conclusion |
|---|---|---|
| [Klein](https://build.nvidia.com/black-forest-labs/flux_2-klein-4b) | Successful decoded RGB JPEGs at 1024×1024, 1344×768, 768×1344, and 1568×672; guidance 1, steps 4, seed 42. Guidance 0 and `mode` received 422. JPEG data-URL array and PNG data-URL string uploads both received 422; PNG rejection mentions `example_id` / `base64`. | Only registered image model; verified non-square generation and preset-0 editing (1.13.0); arbitrary uploads disabled. Guidance upper bound unknown; uint32 seed bound is schema evidence, not boundary probing. |
| [Dev](https://build.nvidia.com/black-forest-labs/flux_1-dev) | Hosted schema: guidance >1 through 9, default 5; steps 5–100, default 50. Prior probe: empty HTTP 504 at 302.05 s. | Probe-only candidate. No successful generation established. |
| [Schnell](https://build.nvidia.com/black-forest-labs/flux_1-schnell) | Hosted schema and live validation require guidance exactly 0; steps 1–4. Corrected probe: empty HTTP 504 at 302.20 s. | Probe-only candidate. No successful generation established. |
| [Kontext](https://build.nvidia.com/black-forest-labs/flux_1-kontext-dev) | Embedded hosted schema explicitly limits image input to `data:image/png;example_id,0` through `2`. Base64 receives `Expected: example_id, got: base64`. Hosted steps are 20–50, versus container steps 5–100. | Restricted preset-image preview, not arbitrary-image editing. Excluded from general image probes and registration. |
| Qwen Image / Edit, SD3.5 Large, NVPCB | Some cards embed FLUX Dev examples; Qwen Image is partner-labelled. Attempted NVIDIA route variants returned 404. | No verified NVIDIA-hosted route/auth contract. A 404 for guessed routes is not proof that no route exists. |

Prior request/result evidence lives under `E:/Downloads/ImageGenTest/NVIDIA NIM/`. The repository records only sanitized conclusions, not prompts, credentials, image data, or complete provider errors. A 504 establishes a gateway timeout, not its root cause or successful request admission; capacity pressure is plausible but unproven.

Dev/Schnell dimension descriptions say 1024 despite broader enums, so probe candidates stay at 1024×1024. Container-only settings must not be copied into hosted records. No candidate is added to `NIM_IMAGE_MODELS`.

## Aspect ratios and reference-image findings (1.12.0)

`aspect_ratio` is a local convenience option, never a NVIDIA body field. Defaults remain square. Explicit width/height must agree with a supplied ratio and must form a verified pair:

| Ratio label (width:height) | Output dimensions | Evidence |
|---|---|---|
| 1:1 | 1024×1024 | Earlier hosted success |
| 16:9 | 1344×768 | Fully decoded hosted success; approximate ratio |
| 9:16 | 768×1344 | Fully decoded hosted success; approximate ratio |
| 21:9 | 1568×672 | Fully decoded hosted success; exact ratio |

The playground templates reverse the landscape/portrait labels and send width/height, not a ratio field. Hosted schema descriptions saying 1024-only are contradicted by live generation. The model card's 17-resolution list (672×1568 through 1568×672) describes model output; only verified hosted pairs are enabled. The remaining pairs and playground sizes are isolated in probe candidates. PNG/JPEG model output descriptions do not establish a hosted format-selection parameter; verified responses were JPEG.

Five explicitly approved requests were made for 1.12.0: three non-square generations succeeded (~1.8–2.1 s), and two reference uploads received HTTP 422. Sanitized local reports are `tools/output/images/klein-aspect-edit-1790969089615-b85d29ef.json` and `klein-edit-string-1790969172874-576ccd6d.json`. No generated image bytes were saved by these probes.

Pi supports text and image input blocks. For future verified editing models, the adapter translates image blocks into the model's data-URL transport; the tool reads `inputImage` relative to `ctx.cwd`, or an absolute local path. It refuses URLs/inline data, special files, malformed containers, MIME mismatches, and oversized inputs. A 10 MiB local safety ceiling applies in addition to per-model limits; it is **not** a published NVIDIA bound. Sources are never changed. For current Klein, `inputImage` fails before reading/uploading; no capability claims arbitrary-image editing.

The playground's editing example adds `image: [reference]` to the existing URL and omits `mode`. That template alone is not proof of successful editing. Our two encodings were rejected; preset-only behavior is suggested by the validation response, but other transports are not exhaustively ruled out. Keep arbitrary-image input gated until a real upload succeeds and the edited output is compared with the source. Predefined references have separate verification below.

## Verified non-preset resolutions and preset editing (1.13.0)

Additional generation requests fully decoded at exactly **1024×768** and **1008×752**. Both are enabled now; `4:3` maps to 1024×768. The enabled generation list comprises six verified pairs, not unrestricted dimensions.

A hosted 422 width-validation response supplied all 67 allowed widths: **512–1568 inclusive in increments of 16**. Runtime records preserve that width rule while retaining pair validation. The self-hosted [container schema](https://docs.nvidia.com/nim/visual-genai/latest/_static/_static/yaml/flux-klein.openapi.yaml) lists the same height grid, but our validation request did not expose the hosted height enum or establish every possible combination. Do not silently promote container bounds or other grid pairs.

The hosted reference explicitly documents predefined images. A live request with `image: ["data:image/png;example_id,0"]`, guidance 1, steps 4, seed 42, and no `mode` succeeded (~2.8 s). Its 1024×1024 JPEG fully decoded; visual comparison showed the green frog became red with pose/scene largely preserved. The result differs from NVIDIA's published example output. A scalar fallback was unnecessary and was not tested. Only preset 0 and square preset output are enabled; IDs 1–3 remain unverified even though public examples/descriptions mention them.

Use `preset_example: 0` in the advanced tool, or `ImagesOptions.metadata` from native extension code. It selects editing automatically and conflicts with local/image-block reference input. The selector is never a wire field. The catalog remains `input: ["text"]`, and `evidence.editingVerifiedAt` is reserved for arbitrary uploads; preset evidence is recorded separately per example. No source file is downloaded by runtime preset dispatch. The native image adapter and tool share translation, authentication, cancellation, artifact validation, and exclusive saving.

Evidence reports:
- `tools/output/images/klein-arbitrary-resolutions-1790971632105-2cc74ba3.json`
- `tools/output/images/klein-validator-preset-1790973765185-b5c23bc2.json`

Source/result previews for semantic review were saved to a temporary scratch directory, not report JSON or the workspace. No additional inference was performed while implementing 1.13.0. `out/granite-texture.jpg` was not modified.

## Maintained probe workflow

```bash
# Default: offline dry run, no credentials/decoder/network or file writes needed
npm run probe:images -- --model=black-forest-labs/flux.1-schnell
npm run probe:images -- --model=black-forest-labs/flux.1-dev --steps=5
npm run probe:images -- --aspect_ratio=16:9
# Grid dimensions: offline validation by default
npm run probe:images -- --width=1536 --height=864
npm run probe:images -- --preset_example=0 --prompt="Make the frog red."
# Optional curated model-card/playground pair filter (not needed for grid sizes):
npm run probe:images -- --candidate-dimensions --width=688 --height=1504
# Offline input validation for an unverified editing transport (reads local file):
npm run probe:images -- --input-image=out/granite-texture.jpg --image-transport=data-url-array

# Explicit live opt-in, ONE inference request; no automatic retries
# Requires your approval/quota, NVIDIA_NIM_API_KEY (or NVIDIA_API_KEY), and Photon.
# Optional: resolve the decoder from the installed Pi environment.
PI_NODE_MODULES=E:/Munka/Node/Tools/node_modules npm run probe:images -- --live --model=black-forest-labs/flux.1-schnell
```

The optional pixel decoder is `@silvia-odwyer/photon-node` (already supplied by this Pi installation); it can also be installed separately for probe tooling. It is **not** a runtime extension dependency. Live probing refuses to spend quota if the decoder or key is unavailable.

Options use `--name=value`: `model`, `prompt`, `width`, `height`, `aspect_ratio`, `preset_example`, `steps`, `samples`, `cfg_scale`, `seed`, `input-image`, `image-transport` (`data-url-array` or `data-url-string`), `timeout-ms`, `output`. `--candidate-dimensions` restricts probes to curated Klein model-card/playground pairs; it is no longer needed for grid sizes and does not change registration. Reference-image probes are likewise explicitly Klein-scoped and never enable the registered model. The `input-image` option reads a local file even in dry-run; reports contain only its format/byte count, not its path or content. Dry runs write nothing unless `--output` is explicitly supplied. `--live` saves a new JSON report under `tools/output/images/` by default. Reports are created exclusively: existing files are never overwritten. They contain scoped source references, settings, status, duration, counts, decoded dimensions, and qualification—not prompts, keys, base64, raw responses, or error details. The probe never saves image bytes. Decoded artifacts qualify generation, not semantic editing: `editingSemanticsReviewed` stays false and a successful edit probe still requires manual source/result review.

`generationVerified` requires HTTP 200, successful normalized artifacts, actual pixel decoding, and agreement with requested dimensions. An `artifacts` array alone, filtered-only output, malformed bytes, or a 504 cannot qualify a model. The default 325-second timeout permits observing the roughly 302-second gateway timeout; raising client timeouts cannot cure an upstream 504.

A new successful report does **not** register a model automatically. Review the evidence, update the runtime record and regressions, bump the version, then deploy. No live requests were made for the 1.11.0 hardening release.

## Verification

- `npm test`: existing chat suites plus image normalization/saving, hardening, probe, aspect/edit, preset, and grid tests. All 4,489 grid combinations are exercised offline for client validation only; this is not live generation evidence. Covers ratio conflicts/orientation, verified dimension pairs, evidence gating, native image translation, source validation, bounded file reads, and probe isolation. Genuine 1×1 JPEG/PNG/WebP fixtures replace signature fragments.
- `PI_NODE_MODULES=E:/Munka/Node/Tools/node_modules npm run test:pi-images`: optional installed-Pi runtime and argument-validator tests, using only dummy credentials, temporary configuration, and a fetch stub that fails closed. Covers native registration, model headers, provider headers, header-only auth, auth endpoint overrides, and tool artifact detail.
- `npm pack --dry-run`: ensure client, capability records, and maintained probe tooling are packaged.

Runtime base64/container checks reject obvious truncation but are not a full codec validation. Probe qualification adds full pixel decoding. Cancellation races handle late hook rejections; they cannot stop arbitrary user hook side effects. Instrumentation code must remain cooperative where possible.
