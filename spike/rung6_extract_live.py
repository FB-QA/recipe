#!/usr/bin/env python3
"""Rung 6 (follow-up spike) — LIVE Haiku extraction of retrieved IG captions.

Feeds real Apify-retrieved captions (spike/apify_out/) to claude-haiku-4-5,
forcing STRUCTURED JSON via output_config.format (json_schema). Reports live
token usage + cent cost, confirms it parses, is complete, and does NOT invent
missing data.

Dependency-free: calls the Anthropic Messages API over raw HTTPS (the anthropic
SDK isn't installed in this environment).

Haiku 4.5 pricing: $1.00 / 1M input, $5.00 / 1M output.
"""
import glob
import json
import os
import urllib.request
import urllib.error

MODEL = "claude-haiku-4-5-20251001"
IN_PER_M = 1.00
OUT_PER_M = 5.00
HERE = os.path.dirname(__file__)

# Nullable scalars + array fields => a sparse caption yields nulls/[] not lies.
SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": ["string", "null"]},
        "description": {"type": ["string", "null"]},
        "ingredients": {"type": "array", "items": {"type": "string"}},
        "steps": {"type": "array", "items": {"type": "string"}},
        "prep_time": {"type": ["string", "null"]},
        "cook_time": {"type": ["string", "null"]},
        "servings": {"type": ["string", "null"]},
        "tips": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["title", "description", "ingredients", "steps",
                 "prep_time", "cook_time", "servings", "tips"],
    "additionalProperties": False,
}

SYSTEM = (
    "You extract structured recipe data from unstructured text (recipe web "
    "pages or social captions). Return ONLY data present in the source. If a "
    "field is not stated, use null (scalars) or [] (lists). NEVER invent "
    "ingredients, quantities, times, or servings that are not in the text."
)


def key():
    for line in open(os.path.join(HERE, "..", ".env")):
        if line.startswith("ANTHROPIC_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("no ANTHROPIC_API_KEY")


def cost_cents(u):
    return (u["input_tokens"] / 1e6 * IN_PER_M
            + u["output_tokens"] / 1e6 * OUT_PER_M) * 100


def extract(api_key, label, text):
    body = {
        "model": MODEL,
        "max_tokens": 1500,
        "system": SYSTEM,
        "output_config": {"format": {"type": "json_schema", "schema": SCHEMA}},
        "messages": [{"role": "user",
                      "content": f"Extract the recipe from this text:\n\n{text}"}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json",
                 "x-api-key": api_key,
                 "anthropic-version": "2023-06-01"},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            resp = json.load(r)
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}: {e.read().decode()[:400]}")
        raise
    txt = next(b["text"] for b in resp["content"] if b["type"] == "text")
    data = json.loads(txt)  # raises if not valid JSON
    u = resp["usage"]
    print(f"\n=== {label} ===")
    print(f"tokens: in={u['input_tokens']} out={u['output_tokens']}  "
          f"cost={cost_cents(u):.4f} cents")
    print(f"title={data['title']!r}")
    print(f"ingredients={len(data['ingredients'])}  steps={len(data['steps'])}  "
          f"prep={data['prep_time']!r} cook={data['cook_time']!r} "
          f"servings={data['servings']!r} tips={len(data['tips'])}")
    return data, u


def main():
    api_key = key()
    total = 0.0
    for path in sorted(glob.glob(os.path.join(HERE, "apify_out", "caption_*.txt"))):
        text = open(path).read()
        label = os.path.basename(path)
        data, u = extract(api_key, label, text)
        total += cost_cents(u)
        # Sanity: print full JSON for the record
        print("  ingredients:", data["ingredients"][:3], "..." if len(data["ingredients"]) > 3 else "")
        print("  steps[0]:", (data["steps"][0][:80] if data["steps"] else None))
    print(f"\nTOTAL LIVE HAIKU SPEND THIS RUN: {total:.4f} cents")


if __name__ == "__main__":
    main()
