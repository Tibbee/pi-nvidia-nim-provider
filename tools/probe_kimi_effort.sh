#!/bin/bash
PROMPT="Prove that the square root of 2 is irrational."
probe() {
  local name="$1" extra="$2"
  local body tmp code
  tmp=$(mktemp)
  body=$(jq -n --arg m "moonshotai/kimi-k3" --arg p "$PROMPT" --argjson extra "$extra" \
    '{model:$m, messages:[{role:"user",content:$p}], max_tokens:4096} + $extra')
  code=$(curl -s -o "$tmp" -w "%{http_code}" https://integrate.api.nvidia.com/v1/chat/completions \
    -H "Authorization: Bearer $NVIDIA_API_KEY" -H "Content-Type: application/json" -d "$body")
  if [ "$code" = "200" ]; then
    local rt ct
    rt=$(jq -r '.choices[0].message.reasoning_content // "" | length' "$tmp")
    ct=$(jq -r '.usage.completion_tokens_details.reasoning_tokens // .usage.completion_tokens_details.reasoning // "n/a"' "$tmp")
    local total
    total=$(jq -r '.usage.completion_tokens // "n/a"' "$tmp")
    echo "$name | HTTP $code | reasoning_chars=$rt | reasoning_tokens=$ct | completion_tokens=$total"
  else
    echo "$name | HTTP $code | $(head -c 160 "$tmp")"
  fi
  rm -f "$tmp"
}
probe "1 baseline kwargs-thinking-true     " '{"chat_template_kwargs":{"thinking":true}}'
sleep 45   # NIM free-tier limiter needs wide spacing
probe "2 top-level effort=low             " '{"reasoning_effort":"low"}'
sleep 45   # NIM free-tier limiter needs wide spacing
probe "3 top-level effort=max             " '{"reasoning_effort":"max"}'
sleep 45   # NIM free-tier limiter needs wide spacing
probe "4 kwargs-thinking-true + effort=max" '{"chat_template_kwargs":{"thinking":true},"reasoning_effort":"max"}'
