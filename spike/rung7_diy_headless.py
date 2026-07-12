#!/usr/bin/env python3
"""
Rung 7 — DIY headless-browser Instagram Reel retrieval (NO Apify, NO login).

Question: can a self-hosted headless Chromium (Playwright) load a PUBLIC
Instagram Reel the way a human browser does, and scrape caption + a
downloadable video URL, with no login and no paid provider?

THROWAWAY spike. No AI keys used. Run from a residential IP (Mac Mini) — see
the IP caveat in the findings doc: a PASS here is necessary-but-not-sufficient.

Usage:
    python3 spike/rung7_diy_headless.py            # headless (default)
    HEADFUL=1 python3 spike/rung7_diy_headless.py  # watch it run

Outputs evidence under spike/diy_out/:
    dom_<shortcode>.html      full rendered HTML
    shot_<shortcode>.png      screenshot of the rendered page
    result.json               machine-readable per-URL outcome
"""
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).parent / "diy_out"
OUT.mkdir(exist_ok=True)

# The 3 Reels Apify retrieved 3/3 (reuse for a like-for-like comparison),
# plus a 4th from another well-known public recipe account.
URLS = [
    "https://www.instagram.com/reel/CtMXPf7gIB0/",  # recipesbyanne
    "https://www.instagram.com/reel/DIRetiCppK5/",  # smittenkitchen
    "https://www.instagram.com/reel/CmxDtLeB-pY/",  # dianemorrisey
    # 4th: another well-known public recipe account reel.
    "https://www.instagram.com/reel/C9Zx0qgR4mS/",  # halfbakedharvest
]

DESKTOP_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.0.0 Safari/537.36"
)

LOGIN_WALL_MARKERS = [
    "loginForm",
    "Log in to Instagram",
    "Log In",
    'name="username"',
    "accountsPasswordReset",
    "You must log in to continue",
    "Sorry, this page isn't available",
    "restricted",
]


def shortcode(url: str) -> str:
    m = re.search(r"/reel/([A-Za-z0-9_-]+)", url)
    return m.group(1) if m else url.rsplit("/", 2)[-2]


def try_download(url: str, want_bytes: int = 400_000) -> dict:
    """Fetch the first ~want_bytes of a URL to prove it's really fetchable."""
    if not url:
        return {"attempted": False}
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": DESKTOP_UA,
                "Range": f"bytes=0-{want_bytes - 1}",
                "Referer": "https://www.instagram.com/",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read(want_bytes)
            return {
                "attempted": True,
                "ok": len(data) > 10_000,
                "status": resp.status,
                "content_type": resp.headers.get("Content-Type"),
                "bytes_read": len(data),
            }
    except Exception as e:  # noqa: BLE001
        return {"attempted": True, "ok": False, "error": f"{type(e).__name__}: {e}"}


def extract(page, html: str) -> dict:
    """Pull caption / video / thumbnail from meta tags and rendered DOM."""
    out = {}

    def meta(prop):
        try:
            el = page.query_selector(f'meta[property="{prop}"]')
            return el.get_attribute("content") if el else None
        except Exception:  # noqa: BLE001
            return None

    out["og_description"] = meta("og:description")
    out["og_video"] = meta("og:video") or meta("og:video:secure_url")
    out["og_image"] = meta("og:image")
    out["og_title"] = meta("og:title")

    # rendered <video> element
    try:
        vid = page.evaluate(
            """() => {
                const v = document.querySelector('video');
                if (!v) return null;
                return { src: v.src || null, currentSrc: v.currentSrc || null,
                         poster: v.poster || null };
            }"""
        )
        out["video_element"] = vid
    except Exception as e:  # noqa: BLE001
        out["video_element"] = {"error": str(e)}

    # any mp4 URL sitting in the page source / embedded JSON
    mp4s = re.findall(r'https://[^"\\\s]+\.mp4[^"\\\s]*', html)
    out["mp4_in_source_count"] = len(set(mp4s))
    out["mp4_sample"] = list(dict.fromkeys(mp4s))[:2]

    # login-wall detection
    hits = [m for m in LOGIN_WALL_MARKERS if m.lower() in html.lower()]
    out["login_wall_markers"] = hits
    return out


def run():
    headful = os.environ.get("HEADFUL") == "1"
    captured_media = {}  # url -> content_type, seen via network sniffing

    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not headful)
        ctx = browser.new_context(
            user_agent=DESKTOP_UA,
            viewport={"width": 1440, "height": 900},
            locale="en-US",
        )
        page = ctx.new_page()

        # sniff media responses to catch the real video URL even if the DOM hides it
        def on_response(resp):
            try:
                ct = resp.headers.get("content-type", "")
                if "video" in ct or ".mp4" in resp.url:
                    captured_media[resp.url] = ct
            except Exception:  # noqa: BLE001
                pass

        page.on("response", on_response)

        for url in URLS:
            sc = shortcode(url)
            print(f"\n=== {url}  ({sc}) ===", flush=True)
            captured_media.clear()
            rec = {"url": url, "shortcode": sc}
            try:
                resp = page.goto(url, wait_until="domcontentloaded", timeout=45_000)
                rec["http_status"] = resp.status if resp else None
                rec["final_url"] = page.url
                # give JS time to render + settle
                try:
                    page.wait_for_load_state("networkidle", timeout=15_000)
                except Exception:  # noqa: BLE001
                    pass
                time.sleep(4)

                html = page.content()
                (OUT / f"dom_{sc}.html").write_text(html, encoding="utf-8")
                try:
                    page.screenshot(path=str(OUT / f"shot_{sc}.png"), full_page=False)
                except Exception:  # noqa: BLE001
                    pass

                ex = extract(page, html)
                rec.update(ex)
                rec["redirected_to_login"] = "/accounts/login" in page.url

                # best video URL candidate.
                # NOTE: the <video> element only ever exposes a blob: URL
                # (MediaSource Extensions) which is NOT fetchable server-side.
                # The real, downloadable .mp4 is only visible by sniffing the
                # network responses — so that source is preferred here.
                net_mp4 = next(iter(captured_media), None)
                blob_src = (ex.get("video_element") or {}).get("currentSrc") or (
                    ex.get("video_element") or {}
                ).get("src")
                cand = (
                    ex.get("og_video")
                    or net_mp4  # the winning technique
                    or (ex.get("mp4_sample") or [None])[0]
                    or blob_src  # last resort — will fail download (blob:)
                )
                # strip the captured byte-range so we can request our own
                if cand:
                    cand = re.sub(r"&bytestart=\d+&byteend=\d+", "", cand)
                rec["video_candidate"] = cand
                rec["network_media_seen"] = list(captured_media.items())[:3]
                rec["download"] = try_download(cand) if cand else {"attempted": False}

                cap = ex.get("og_description") or ""
                print(f"  http={rec.get('http_status')} final={page.url}")
                print(f"  login_wall_markers={ex.get('login_wall_markers')}")
                print(f"  caption_chars={len(cap)}")
                print(f"  video_candidate={'YES' if cand else 'NONE'}")
                print(f"  download={rec['download']}")
            except Exception as e:  # noqa: BLE001
                rec["fatal_error"] = f"{type(e).__name__}: {e}"
                print(f"  FATAL: {rec['fatal_error']}")
            results.append(rec)

        browser.close()

    (OUT / "result.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print("\n\n===== SUMMARY =====")
    for r in results:
        cap = r.get("og_description") or ""
        dl = r.get("download") or {}
        print(
            f"{r['shortcode']}: http={r.get('http_status')} "
            f"caption={'Y' if cap else 'N'}({len(cap)}) "
            f"video_url={'Y' if r.get('video_candidate') else 'N'} "
            f"downloadable={'Y' if dl.get('ok') else 'N'} "
            f"login_wall={'Y' if r.get('login_wall_markers') or r.get('redirected_to_login') else 'N'}"
        )
    print(f"\nEvidence written to {OUT}")


if __name__ == "__main__":
    run()
