# Hosted image generation: evidence and safe probing

## Hosted exploration and usable layout guidance (1.17.0, 2026-10-17)

This exploration used only the public NVIDIA hosted endpoints, synthetic
reference images and simple geometric prompts. It made 18 requests: eight
produced images; the rest were controlled validation/upload tests. No private
images were read or uploaded, no retry loop was used, and no BFL/self-hosted
backend was substituted.

| Question | FLUX 3 Image Klein | FLUX.2 Klein 4B |
|---|---|---|
| PNG data-URL array input | 422: requires preset example_id instead of actual image data | 422 |
| PNG data-URL string input | Same explicit preset rejection | 422 |
| Opposite layout rows at fixed seed 42 | Four decoded images across two box geometries moved red/blue centers to requested opposite sides | Left case matched, reversed case did not; no reliable layout claim |
| Requested 1568×1568 | 422: 2,458,624 exceeds supported image size 1,062,400 | Same explicit ceiling |
| Exact 800×1328 area boundary | 200, SUCCESS JPEG, fully decoded at requested dimensions | 200, SUCCESS JPEG, fully decoded at requested dimensions |
| Requested 4096×4096 | 422: dimensions outside hosted axis grids | Same |

Both models require width/height on their existing 512–1568/16 grids **and**
width×height ≤1,062,400. The client now rejects combinations exceeding that
ceiling without dispatch. Earlier axis-only validation did not establish this
joint constraint. Successful boundary generation confirms approximately 1.06 MP;
the current endpoints do not admit 4K dimensions. This does not prove every
grid/area-admitted combination is otherwise accepted.

FLUX 3 now exposes optional structured `layout` rows through `nim-generate-image`
and native `ImagesOptions.metadata.layout`. Each row has `id`, `bbox` and
`desc`; every ID must appear in the caption as `<id>`. Boxes use
`[top,left,bottom,right]`, integer coordinates 0–1000 and positive area. Rows
compile to JSON appended to the caption inside **prompt**, never a new provider
body field. Caption and rows together obey the 2000-character limit. No text,
coordinates or row order are silently changed. Up to 20 rows is a local input
bound, not a claimed NVIDIA limit.

Observed placement is approximate. The first tall-box probes stretched the
requested square/circle and clipped one shape; square boxes produced better
geometric fidelity. The four FLUX 3 outputs put the red center near normalized
x=0.239/0.763 and the blue center on the opposite side. FLUX.2 retained its
red-left/blue-right composition after the boxes were reversed. Consequently,
FLUX.2 rejects the structured option rather than advertising unverified control.
Arbitrary raw prompt strings remain caller-controlled for both models.

Reference uploads stay disabled. Single/multiple user-image editing, exact pixel
preservation, a server-side prompt upsampler and native 4K are not exposed by this
release. Preset editing is not reintroduced. Full scene captions can be prepared
by the caller/LLM before generation; that is separate from a native NIM feature.

Probe reports and original generated JPEGs are local-only under
`tools/output/klein-explore-2026-10-17/`; they are excluded from the npm package.
The JSON reports contain settings/status/decoded dimensions and color centroids,
not credentials or image data. The reference PNG is a programmatically created
green square on white. See `flux3-image-array.json`, `flux3-image-string.json`,
`flux2-image-array.json`, `flux2-image-string.json`, the `*-layout-*.json` files,
`*-size-error.json`, `*-area-boundary.json` and `*-4096-validation.json`.
Comparison images: `flux3-square-layout-red-left-0.jpg` and
`flux3-square-layout-red-right-0.jpg`.

For repeatable layout probes, place rows in a JSON array file and run
`npm run probe:images -- --layout-file=layout.json --prompt="A red square <red_square>."`.
It is dry-run by default; the caption must name all IDs in the file. Add `--live`
only for a hosted generation. File reads are limited to 64 KiB (local policy),
and saved reports include counts/compiled length instead of row contents or paths.
The README has a complete two-element tool example. Older sections below are
dated evidence snapshots; the limits and capabilities above are current.

Deployment verification: version 1.17.0 was copied to the live extension after
all 12 default suites, both installed-Pi integration suites and package checks
passed. All 18 runtime/package/documentation files matched development hashes.
A nineteenth request through the **deployed tool and installed Pi runtime**
generated a 1024×1024 JPEG in 5.64 s with red-right/blue-left positions matching
the supplied boxes (normalized centers 0.762/0.239). Its body contained only
prompt and the existing numeric fields; layout compiled once into the prompt.
`live-layout.json` and `live-layout.jpg` record this end-to-end check. The live
catalog retained 16 chat models and both Klein image models. Manual TUI/codemode
acceptance remains a separate boundary.

## Two Klein models (1.16.0, 2026-10-17)

Both **FLUX 3 Image Klein** (`black-forest-labs/flux-3-image-klein`) and
**FLUX.2 Klein 4B** (`black-forest-labs/flux.2-klein-4b`) are registered.
FLUX 3 remains the default. Select FLUX.2 explicitly through the tool's `model`
field or Pi's native image-model lookup. There is no automatic model fallback.
Both operations share the existing authenticated client, artifact validation,
cancellation and explicit non-overwriting saving. Model-specific settings are
resolved from separate capability records; image requests remain isolated from
chat payload transformations.

FLUX.2 freshly returned HTTP 200 in 1.67 s with a SUCCESS JPEG fully decoded
at 1024×1024, using steps 4, guidance 1, samples 1 and seed 42. An invalid
request independently reconfirmed both dimension axes at 512–1568/16, steps
maximum 4, guidance minimum 1 and seed <4294967296. It now enforces an
**800-character prompt maximum**, contradicting its published 10000-character
schema and the previous record. The client enforces 800 before dispatch.
FLUX 3 keeps its separate 2000-character limit, steps 50/default and guidance
3.5/default. Both remain generation-only; arbitrary-image editing is disabled.

### Other hosted image models checked 2026-10-17

| Model | Current observation | Extension status |
|---|---|---|
| FLUX.1 Dev | Generation at 1024×1024, steps 5, guidance 5, seed 42 returned HTTP 500 after 81.29 s | Unverified candidate; inconclusive availability, no retirement established |
| FLUX.1 Schnell | Generation at 1024×1024, steps 4, guidance 0, seed 42 reached the 90 s client timeout | Unverified candidate; inconclusive availability, no retirement established |
| FLUX.1 Kontext Dev | Hosted schema explicitly restricts reference input to predefined example IDs 0–2 | Not an arbitrary-image editing feature; excluded from registration; no new inference probe |
| Stable Diffusion XL | NVIDIA page explicitly marks endpoint deprecated as of 2025-07-24; build and reference endpoint spellings returned 404 | Deprecated hosted endpoint; not registered |
| Stable Diffusion 3 Medium | NVIDIA page explicitly marks endpoint deprecated as of 2026-04-15; endpoint returned 404 | Deprecated hosted endpoint; not registered |
| Qwen Image / Image Edit | Pages describe downloadable models; embedded request examples still identify FLUX.1 Dev | Independent hosted Qwen generation is not established; not registered |

Sources: [Dev](https://build.nvidia.com/black-forest-labs/flux_1-dev),
[Schnell](https://build.nvidia.com/black-forest-labs/flux_1-schnell),
[Kontext](https://build.nvidia.com/black-forest-labs/flux_1-kontext-dev),
[SDXL](https://build.nvidia.com/stabilityai/stable-diffusion-xl),
[SD3 Medium](https://build.nvidia.com/stabilityai/stable-diffusion-3-medium),
[Qwen Image](https://build.nvidia.com/qwen/qwen-image) and
[Qwen Image Edit](https://build.nvidia.com/qwen/qwen-image-edit).
The past retirement notices, rather than HTTP 404 alone, establish the Stable
Diffusion classification. The FLUX.1 errors do not prove a permanent outage.
Local report: `tools/output/coexist-2026-10-17/hosted-image-checks.json`.

After deployment, installed Pi exposed both image models and all 16 chat models.
An explicit FLUX.2 tool call through the **live extension** generated a fully
decoded 1024×1024 JPEG in 1.73 s, with its own steps 4/guidance 1 defaults.
Report: `tools/output/coexist-2026-10-17/live-pi-images.json`. Eleven default
test suites, installed-Pi image coexistence/auth/validation and chat regression
checks, package dry run and deployment file hashes passed. This does not claim
manual TUI acceptance or complete generation coverage for the dimension grid.

## FLUX 3 replacement (1.15.0, 2026-10-17)

At version 1.15.0, the sole registered/default image model was **FLUX 3 Image Klein**, ID
`black-forest-labs/flux-3-image-klein`. FLUX.2's capability record remained as
historical/probe support, but was not registered until 1.16.0. All older sections below
describe FLUX.2 observations unless explicitly stated otherwise.

The [build playground](https://build.nvidia.com/black-forest-labs/flux-3-image-klein)
uses `POST https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux-3-image-klein`.
That URL returned HTTP 200 in 5.05 seconds with one SUCCESS JPEG, seed 42;
full pixel decoding confirmed 1024×1024. The API reference instead names a
`flux.3-image-klein` path: that dotted URL returned 404. The adapter uses the
successfully probed hyphenated URL and sends neither `mode` nor `model`.

The request used steps 50, guidance 3.5, samples 1 and seed 42. FLUX 3 has its
own capability record: prompt maximum 2000 characters, steps 1–50/default 50,
guidance >1 through 20/default 3.5, samples 1 and uint32 seed. Guidance bounds
are hosted-schema evidence; only 3.5 was generation-tested. A separate invalid
request returned HTTP 422 independently listing **both** width and height as
512–1568 in increments of 16, and confirming the prompt/step maxima. This
contradicts the published smaller dimension enums and 1024-only descriptions.
The adapter admits that grid and preserves local ratio mappings; only the
default square output was generation-tested for FLUX 3. Combined-size
restrictions remain unknown. Validation does not promise generation for all
4489 pairs.

The hosted schema describes predefined example images, not arbitrary uploads.
Editing remains disabled and is rejected before reading/uploading a user file.
No FLUX.2 upload failure is presented as FLUX 3 verification. Saving, auth,
artifact validation, cancellation, timeout and error semantics use the shared
adapter unchanged. Usage/pricing remain unreported.

Local evidence (no credentials or raw inference text):
`tools/output/refresh-2026-10-17/flux3-generation-hosted.json` and
`tools/output/refresh-2026-10-17/flux3-validation.json`.

After deployment, the **live extension** was registered through the installed
Pi 1.3.0 `ModelRuntime`/`ModelRegistry` with disposable state. Native authenticated
image generation succeeded again in 6.04 seconds using the new model's default
settings and seed 42; its JPEG fully decoded at 1024×1024. The runtime exposed
16 chat models and one image model, and no FLUX.2 image entry. Report:
`tools/output/refresh-2026-10-17/live-pi-images.json`. This verifies native
dispatch from the deployed source; manual TUI/codemode acceptance remains separate.

## Preset removal (1.14.2)

Klein exposes generation only. The preset selector, capability configuration, example-ID translation, and probe CLI option have been removed. Legacy `preset_example` values are rejected locally by the tool/native adapter; no quota-consuming generation fallback occurs. Arbitrary uploads remain disabled, since NVIDIA\'s hosted preview only accepts predefined images. The grid and all ratio aliases are unchanged. Preset findings below are preserved as historical diagnostic evidence, not current features.

## Runtime requirements and strict settings (1.14.1)

Requires Pi 1.0.0 or later (`pi-ai` and `pi-coding-agent`), which provides mixed-operation registration and authenticated image dispatch. Explicit `null` values in image metadata are rejected locally; only omitted/undefined settings use defaults. No request is sent for invalid settings. Saved successes are numbered contiguously (`shot-1.jpg`, `shot-2.jpg`) even if provider artifact indices have gaps; original indices remain in metadata.

Klein's declared output modality remains image-only. Seed notes and dropped-artifact warnings in native result text blocks are deterministic adapter diagnostics, not generated text. Catalog zero costs mean unreported pricing, not a guarantee of free inference.

## Current resolution policy (introduced in 1.14.0, completed in 1.17.0)

Generation accepts width and height values from **512 through 1568 inclusive**, in **16-pixel increments**, defaulting to 1024 per axis, with **width×height ≤1,062,400**. Both axis lists and the combined ceiling come from actual hosted responses; 800×1328 boundary generation succeeded for each model. No rounding, cropping or resizing occurs. Existing ratio aliases are unchanged, and conflicting explicit dimensions fail locally.

The height confirmation used one approved request (`width=1024, height=1000`), which returned 422 with all 67 allowed heights. Evidence: `tools/output/images/klein-height-validator-1790976162469-94e2d682.json`. The earlier width report is linked below. This proves axis admission rules, not successful generation at every combination or absence of additional joint constraints; upstream errors remain structured, with no automatic retry.

Arbitrary-upload restrictions are unchanged; preset editing is no longer exposed. Older version sections below describe historical evidence/policies, not the current generation whitelist.

## Source precedence and scope

Do not conflate upstream model capabilities, self-hosted NIM container APIs, NVIDIA hosted previews, and actual live observations. A downloadable container OpenAPI document does not establish hosted-preview transport or bounds. Even hosted schemas can contradict live behavior (Klein guidance is the known example).

Runtime records in `models/image-models.ts` identify their hosted schema, successful-generation date, conservative settings, and disagreements. Unknown bounds remain absent rather than invented. Catalog conversion requires generation evidence and an implemented transport. `metadata.json` remains generated chat-only data.

The shared client supports per-model numeric enums/ranges, inclusive/exclusive bounds, multiples, defaults, allowed dimension pairs, ratio mappings, prompt limits, required fields, and request-field filtering. It rejects unimplemented input transports rather than ignoring image blocks. Strict data-URL array/string transports and bounded local-file input are implemented, but catalog registration additionally requires successful editing evidence, accepted image fields, and configured input limits. Klein remains text-only: no arbitrary-image editing succeeded. Asset-ID and generic native preset-only image-block transports remain unimplemented. Predefined-reference editing was diagnostic evidence only; its public selector and runtime implementation were removed in 1.14.2.

## Evidence reviewed 2026-10-02

| Model | Hosted evidence | Operational conclusion |
|---|---|---|
| [Klein](https://build.nvidia.com/black-forest-labs/flux_2-klein-4b) | Successful decoded RGB JPEGs at 1024×1024, 1344×768, 768×1344, and 1568×672; guidance 1, steps 4, seed 42. Guidance 0 and `mode` received 422. JPEG data-URL array and PNG data-URL string uploads both received 422; PNG rejection mentions `example_id` / `base64`. | Only registered image model; verified non-square generation. Preset-0 editing was historical diagnostic evidence (1.13.0); feature removed in 1.14.2. Arbitrary uploads disabled. Guidance upper bound unknown; uint32 seed bound is schema evidence, not boundary probing. |
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

## Historical non-preset resolutions and preset editing (1.13.0)

**Historical record:** the selector/runtime described in this section was removed in 1.14.2. These observations remain useful endpoint evidence, not current usage instructions.

Additional generation requests fully decoded at exactly **1024×768** and **1008×752**. Both are enabled now; `4:3` maps to 1024×768. The enabled generation list comprises six verified pairs, not unrestricted dimensions.

A hosted 422 width-validation response supplied all 67 allowed widths: **512–1568 inclusive in increments of 16**. Runtime records preserve that width rule while retaining pair validation. The self-hosted [container schema](https://docs.nvidia.com/nim/visual-genai/latest/_static/_static/yaml/flux-klein.openapi.yaml) lists the same height grid, but our validation request did not expose the hosted height enum or establish every possible combination. Do not silently promote container bounds or other grid pairs.

The hosted reference explicitly documents predefined images. A live request with `image: ["data:image/png;example_id,0"]`, guidance 1, steps 4, seed 42, and no `mode` succeeded (~2.8 s). Its 1024×1024 JPEG fully decoded; visual comparison showed the green frog became red with pose/scene largely preserved. The result differs from NVIDIA's published example output. A scalar fallback was unnecessary and was not tested. Only preset 0 and square preset output are enabled; IDs 1–3 remain unverified even though public examples/descriptions mention them.

In 1.13.0, `preset_example: 0` was accepted by the advanced tool and native `ImagesOptions.metadata`. It selected editing automatically and conflicted with local/image-block reference input. The selector is never a wire field. The catalog remains `input: ["text"]`, and `evidence.editingVerifiedAt` is reserved for arbitrary uploads; preset evidence is recorded separately per example. No source file is downloaded by runtime preset dispatch. The native image adapter and tool share translation, authentication, cancellation, artifact validation, and exclusive saving.

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
npm run probe:images -- --width=1536 --height=672
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

Options use `--name=value`: `model`, `prompt`, `width`, `height`, `aspect_ratio`, `steps`, `samples`, `cfg_scale`, `seed`, `input-image`, `image-transport` (`data-url-array` or `data-url-string`), `timeout-ms`, `output`. `--candidate-dimensions` restricts probes to curated Klein model-card/playground pairs; it is no longer needed for grid sizes and does not change registration. Reference-image probes are likewise explicitly Klein-scoped and never enable the registered model. The `input-image` option reads a local file even in dry-run; reports contain only its format/byte count, not its path or content. Dry runs write nothing unless `--output` is explicitly supplied. `--live` saves a new JSON report under `tools/output/images/` by default. Reports are created exclusively: existing files are never overwritten. They contain scoped source references, settings, status, duration, counts, decoded dimensions, and qualification—not prompts, keys, base64, raw responses, or error details. The probe never saves image bytes. Decoded artifacts qualify generation, not semantic editing: `editingSemanticsReviewed` stays false and a successful edit probe still requires manual source/result review.

`generationVerified` requires HTTP 200, successful normalized artifacts, actual pixel decoding, and agreement with requested dimensions. An `artifacts` array alone, filtered-only output, malformed bytes, or a 504 cannot qualify a model. The default 325-second timeout permits observing the roughly 302-second gateway timeout; raising client timeouts cannot cure an upstream 504.

A new successful report does **not** register a model automatically. Review the evidence, update the runtime record and regressions, bump the version, then deploy. No live requests were made for the 1.11.0 hardening release.

## Verification

- `npm test`: existing chat suites plus image normalization/saving, hardening, probe, aspect/edit, preset-removal, and grid tests. All 4,489 grid combinations are exercised offline for client validation only; this is not live generation evidence. Covers ratio conflicts/orientation, verified dimension pairs, evidence gating, native image translation, source validation, bounded file reads, and probe isolation. Genuine 1×1 JPEG/PNG/WebP fixtures replace signature fragments.
- `PI_NODE_MODULES=E:/Munka/Node/Tools/node_modules npm run test:pi-images`: optional installed-Pi runtime and argument-validator tests, using only dummy credentials, temporary configuration, and a fetch stub that fails closed. Covers native registration, model headers, provider headers, header-only auth, auth endpoint overrides, and tool artifact detail.
- `npm pack --dry-run`: ensure client, capability records, and maintained probe tooling are packaged.

Runtime base64/container checks reject obvious truncation but are not a full codec validation. Probe qualification adds full pixel decoding. Cancellation races handle late hook rejections; they cannot stop arbitrary user hook side effects. Instrumentation code must remain cooperative where possible.
