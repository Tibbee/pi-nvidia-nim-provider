# Test Prompt for NVIDIA NIM Provider Extension

Copy the text below into a new pi session (started with a non-NVIDIA model, e.g., an OpenRouter model) after disabling the old nvidiaNim.ts extension and loading this one.

---

## Steps to Prepare

1. Disable old extension:
   ```bash
   mv ~/.pi/agent/extensions/nvidiaNim.ts ~/.pi/agent/extensions/nvidiaNim.ts.disabled
   ```

2. Start pi with our extension loaded and a non-NVIDIA model:
   ```bash
   pi -e /path/to/NvidiaProvider
   ```

3. Switch to a non-NVIDIA model first (e.g., an OpenRouter model) via `/model`

4. Paste the test prompt below

---

## Test Prompt

```
I'm testing a new NVIDIA NIM provider extension for pi. I need you to verify it works correctly. Please do the following tests in order:

1. **Model list verification**: Run `pi --list-models` (or use bash to grep the model list) and check that nvidia-nim models appear. Count how many nvidia-nim models are listed and report the number. Check that these key models are present:
   - deepseek-ai/deepseek-v4-flash (1M context, reasoning=yes)
   - qwen/qwen3-coder-480b-a35b-instruct (reasoning=yes)
   - z-ai/glm-5.1 (reasoning=yes)
   - stepfun-ai/step-3.5-flash (262K context, reasoning=yes)
   - minimaxai/minimax-m2.7 (reasoning=yes)
   - openai/gpt-oss-120b (reasoning=yes)

2. **Basic streaming test**: Switch to model `nvidia-nim/deepseek-ai/deepseek-v4-flash` (use /model or Ctrl+P). Then ask it a simple question: "What is 2+2? Reply in one word." Verify you get a response.

3. **Non-NVIDIA provider still works**: Switch back to a non-NVIDIA model (e.g., your OpenRouter default). Ask "What is 3+3? Reply in one word." Verify the response comes from the non-NVIDIA provider. This confirms our extension doesn't break other providers.

4. **Reasoning model test**: Switch to `nvidia-nim/qwen/qwen3-coder-480b-a35b-instruct` with thinking ON. Ask: "Write a function that checks if a number is prime. Think step by step." Verify that reasoning/thinking content appears in pi's thinking panel.

5. **Report findings**: Summarize what worked and what didn't. Specifically note:
   - Did all key models appear in the list?
   - Did streaming work for V4 Flash?
   - Did the non-NVIDIA provider still work after using our extension?
   - Did the reasoning model show thinking content?
   - Any errors or warnings in the output?
```
