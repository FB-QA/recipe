#!/usr/bin/env python3
"""Rung 1 — Website deterministic recipe extraction (NO AI).

Fetch a mix of well-known recipe URLs, look for schema.org/Recipe structured
data (JSON-LD primarily, note microdata), and report completeness.
"""
import json
import re
import sys
import requests

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

URLS = [
    ("BBC Good Food", "https://www.bbcgoodfood.com/recipes/next-level-spaghetti-bolognese"),
    ("Serious Eats", "https://www.seriouseats.com/the-best-chocolate-chip-cookies-recipe"),
    ("NYT Cooking", "https://cooking.nytimes.com/recipes/1016062-baked-macaroni-and-cheese"),
    ("AllRecipes", "https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/"),
    ("Food Network", "https://www.foodnetwork.com/recipes/ina-garten/perfect-roast-chicken-recipe-1940592"),
    ("Smitten Kitchen (indie)", "https://smittenkitchen.com/2025/04/simplest-brisket-with-braised-onions/"),
    ("Budget Bytes (indie)", "https://www.budgetbytes.com/garlic-noodles/"),
    ("Minimalist Baker (indie)", "https://minimalistbaker.com/one-bowl-vegan-chocolate-cake/"),
    ("Love and Lemons (indie)", "https://www.loveandlemons.com/pasta-recipe/"),
]

FIELDS = ["name", "recipeIngredient", "recipeInstructions",
          "prepTime", "cookTime", "totalTime", "recipeYield"]


def find_recipe_in_jsonld(obj):
    """Recursively find a node whose @type includes Recipe."""
    if isinstance(obj, list):
        for item in obj:
            r = find_recipe_in_jsonld(item)
            if r:
                return r
    elif isinstance(obj, dict):
        t = obj.get("@type", "")
        types = t if isinstance(t, list) else [t]
        if "Recipe" in types:
            return obj
        if "@graph" in obj:
            return find_recipe_in_jsonld(obj["@graph"])
    return None


def analyse(name, url):
    row = {"site": name, "url": url, "status": None, "jsonld_recipe": False,
           "microdata": False, "fields": {}, "note": ""}
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=20)
        row["status"] = r.status_code
        html = r.text
    except Exception as e:
        row["note"] = f"fetch error: {e}"
        return row

    # microdata presence (informational)
    if re.search(r'itemtype=["\']https?://schema.org/Recipe', html):
        row["microdata"] = True

    # NOTE: attribute value may be quoted OR unquoted (e.g. Yoast: type=application/ld+json)
    blocks = re.findall(
        r'<script[^>]*type=["\']?application/ld\+json["\']?[^>]*>(.*?)</script>',
        html, re.DOTALL | re.IGNORECASE)
    recipe = None
    for b in blocks:
        b = b.strip()
        try:
            data = json.loads(b)
        except Exception:
            # some sites embed raw HTML entities / multiple objects; try a light clean
            try:
                data = json.loads(b.encode().decode("unicode_escape"))
            except Exception:
                continue
        recipe = find_recipe_in_jsonld(data)
        if recipe:
            break

    if recipe:
        row["jsonld_recipe"] = True
        for f in FIELDS:
            v = recipe.get(f)
            present = bool(v)
            # count instructions/ingredients length for signal
            if f in ("recipeIngredient", "recipeInstructions") and isinstance(v, list):
                row["fields"][f] = len(v)
            else:
                row["fields"][f] = present
    return row


def main():
    results = []
    for name, url in URLS:
        row = analyse(name, url)
        results.append(row)
        print(f"[{row['status']}] {name:32} jsonld={row['jsonld_recipe']} "
              f"microdata={row['microdata']} {row['note']}")
        if row["jsonld_recipe"]:
            f = row["fields"]
            print(f"       name={f.get('name')} ingredients={f.get('recipeIngredient')} "
                  f"steps={f.get('recipeInstructions')} prep={f.get('prepTime')} "
                  f"cook={f.get('cookTime')} total={f.get('totalTime')} yield={f.get('recipeYield')}")
    with_recipe = sum(1 for r in results if r["jsonld_recipe"])
    print(f"\nSUMMARY: {with_recipe}/{len(results)} carry parseable Recipe JSON-LD")
    with open(sys.argv[1] if len(sys.argv) > 1 else "/dev/null", "w") as fh:
        json.dump(results, fh, indent=2)


if __name__ == "__main__":
    main()
