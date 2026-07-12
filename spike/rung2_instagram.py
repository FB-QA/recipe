#!/usr/bin/env python3
"""Rung 2 — Instagram retrieval attempts for ARBITRARY public content.

We do NOT own these accounts and use no business account / auth token.
Goal: find out, today, which methods actually return caption + media for a
public recipe Reel, and document exactly what is blocked.

Methods tried per URL:
  A. Public oEmbed (graph.facebook.com/v.../instagram_oembed) -- needs app token
  B. Legacy oEmbed (api.instagram.com/oembed)                 -- deprecated
  C. Public page HTML fetch (browser UA)  -> og:description / og:video meta
  D. ?__a=1&__d=dis JSON endpoint
  E. Public GraphQL (shortcode media) endpoint
"""
import json
import re
import sys
import requests

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

# Real PUBLIC recipe Reels/posts (public creator accounts).
POSTS = [
    ("Smitten Kitchen brisket reel", "https://www.instagram.com/reel/DIRetiCppK5/"),
    ("Boursin baked pasta reel", "https://www.instagram.com/reel/CtMXPf7gIB0/"),
    ("Diane Morrisey viral recipe reel", "https://www.instagram.com/reel/CmxDtLeB-pY/"),
]


def shortcode(url):
    m = re.search(r'/(?:reel|p|tv)/([A-Za-z0-9_-]+)', url)
    return m.group(1) if m else None


def try_get(label, url, headers=None, params=None):
    h = {"User-Agent": UA}
    if headers:
        h.update(headers)
    try:
        r = requests.get(url, headers=h, params=params, timeout=20, allow_redirects=True)
        snippet = r.text[:300].replace("\n", " ")
        print(f"  {label:34} HTTP {r.status_code}  len={len(r.text)}  final={r.url[:70]}")
        return r
    except Exception as e:
        print(f"  {label:34} ERROR {e}")
        return None


def extract_meta(html):
    out = {}
    for prop in ("og:description", "og:title", "og:video", "og:image", "og:type"):
        m = re.search(r'<meta[^>]+property=["\']' + re.escape(prop) +
                      r'["\'][^>]+content=["\'](.*?)["\']', html, re.DOTALL)
        if m:
            out[prop] = m.group(1)[:200]
    return out


def main():
    for label, url in POSTS:
        sc = shortcode(url)
        print(f"\n### {label}  ({url})  shortcode={sc}")

        # A. Facebook Graph oEmbed (the officially-sanctioned path)
        try_get("A. graph oEmbed (no token)",
                "https://graph.facebook.com/v20.0/instagram_oembed",
                params={"url": url})

        # B. Legacy oEmbed
        try_get("B. legacy api oEmbed",
                "https://api.instagram.com/oembed/", params={"url": url})

        # C. Public page HTML -> meta tags
        r = try_get("C. public page HTML", url)
        if r is not None and r.status_code == 200:
            meta = extract_meta(r.text)
            if meta:
                print("     meta tags found:")
                for k, v in meta.items():
                    print(f"       {k}: {v}")
            else:
                print("     no og: meta tags in returned HTML (login wall shell?)")
            # is it a login wall?
            if "loginForm" in r.text or "Log in" in r.text[:5000] or "/accounts/login" in r.text:
                print("     >> login-wall markers present in HTML")

        # D. ?__a=1 JSON
        try_get("D. ?__a=1&__d=dis", url.rstrip("/") + "/?__a=1&__d=dis")

        # E. Public GraphQL by shortcode
        if sc:
            try_get("E. graphql shortcode",
                    "https://www.instagram.com/graphql/query/",
                    params={"query_hash": "9f8827793ef34641b2fb195d4d41151c",
                            "variables": json.dumps({"shortcode": sc})})


if __name__ == "__main__":
    main()
