#!/usr/bin/env python3
"""Rung 3 — AI structured extraction with Haiku, cost measured per import.

Sends recipe text to claude-haiku-4-5 forcing STRUCTURED JSON output.
Reports real token usage and computes cent cost using Haiku 4.5 pricing:
  input  $1.00 / 1M tokens
  output $5.00 / 1M tokens

Three inputs:
  1. Real scraped BBC recipe body (Rung 1 output) — rich source.
  2. Realistic COMPLETE Instagram-style caption (IG blocked in Rung 2, so
     constructed to mimic a real recipe Reel caption).
  3. Deliberately SPARSE caption — tests that the model does NOT invent data.
"""
import json
import os
import sys
import anthropic

MODEL = "claude-haiku-4-5-20251001"
IN_PER_M = 1.00
OUT_PER_M = 5.00

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

COMPLETE_CAPTION = """CREAMY TUSCAN CHICKEN 🍗🌿 save this one!!

the sauce is UNREAL. weeknight dinner sorted in 25 mins 🙌

what you need:
- 4 chicken breasts
- 2 tbsp olive oil
- 3 cloves garlic, minced
- 1 cup sundried tomatoes
- 1 cup heavy cream
- 1/2 cup parmesan
- 2 cups baby spinach
- salt + pepper

how to:
1. season + sear chicken 5 min each side, set aside
2. same pan, fry garlic + sundried toms 2 min
3. pour in cream + parmesan, simmer till thick
4. stir through spinach till wilted
5. add chicken back, spoon over sauce. done!

serves 4. prep 10 min, cook 15 min.
tip: swap cream for coconut milk to make it dairy free 🥥
#tuscanchicken #weeknightdinner #easyrecipe"""

SPARSE_CAPTION = """this was SO good 😍😍 recipe coming to the blog soon!!
honestly the best thing i've made all week. link in bio 🔗
#dinner #foodie #yum #homecooking"""


def cost_cents(usage):
    return (usage.input_tokens / 1e6 * IN_PER_M
            + usage.output_tokens / 1e6 * OUT_PER_M) * 100


def extract(client, label, text):
    resp = client.messages.create(
        model=MODEL,
        max_tokens=1500,
        system=SYSTEM,
        output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
        messages=[{"role": "user",
                   "content": f"Extract the recipe from this text:\n\n{text}"}],
    )
    txt = next(b.text for b in resp.content if b.type == "text")
    data = json.loads(txt)  # raises if it doesn't parse
    u = resp.usage
    print(f"\n=== {label} ===")
    print(f"tokens: in={u.input_tokens} out={u.output_tokens}  "
          f"cost={cost_cents(u):.4f} cents")
    print(f"title={data['title']!r}")
    print(f"ingredients={len(data['ingredients'])}  steps={len(data['steps'])}  "
          f"prep={data['prep_time']!r} cook={data['cook_time']!r} "
          f"servings={data['servings']!r} tips={len(data['tips'])}")
    return data, u


def main():
    key = None
    with open("/Users/freddibernon/ai/ecosystem/.env") as fh:
        for line in fh:
            if line.startswith("ANTHROPIC_API_KEY="):
                key = line.split("=", 1)[1].strip()
    client = anthropic.Anthropic(api_key=key)

    body = open(sys.argv[1]).read() if len(sys.argv) > 1 else ""
    total = 0.0
    for label, text in [("REAL BBC recipe body", body),
                        ("COMPLETE IG-style caption", COMPLETE_CAPTION),
                        ("SPARSE IG caption (hallucination test)", SPARSE_CAPTION)]:
        if not text:
            continue
        data, u = extract(client, label, text)
        total += cost_cents(u)
        if "SPARSE" in label:
            invented = bool(data["ingredients"] or data["steps"])
            print(f"  >> invented ingredients/steps from empty source? "
                  f"{'YES (BAD)' if invented else 'NO (correct)'}")

    print(f"\nTOTAL AI SPEND THIS RUN: {total:.4f} cents")


if __name__ == "__main__":
    main()
