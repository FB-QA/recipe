#!/usr/bin/env python3
"""Rung 5 (follow-up spike) — Instagram Reel retrieval via Apify.

The earlier spike proved unauthenticated HTTP retrieval of arbitrary public
Reels is a brick wall. This tests the PAID-provider path: apify/instagram-scraper
(pay-per-result). We feed real PUBLIC recipe Reel URLs and report, per Reel:
  - did we get the CAPTION text?
  - did we get a downloadable VIDEO/media URL?
  - other useful fields (hashtags, thumbnail, transcript?)
  - the REAL Apify cost of the run (usageTotalUsd on the run object).

Runs ONE Apify run with all URLs (cost is per result, so batching is free-ish).
Keeps spend minimal: 2-3 Reels only.

Writes retrieved captions to spike/apify_out/ for the extraction rung to reuse.
"""
import json
import os
import time
import urllib.request
import urllib.error

APIFY_BASE = "https://api.apify.com/v2"
ACTOR = "apify~instagram-scraper"

# Real PUBLIC recipe Reels from well-known public recipe accounts.
POSTS = [
    ("Smitten Kitchen", "https://www.instagram.com/reel/DIRetiCppK5/"),
    ("Boursin baked pasta", "https://www.instagram.com/reel/CtMXPf7gIB0/"),
    ("Diane Morrisey", "https://www.instagram.com/reel/CmxDtLeB-pY/"),
]


def token():
    for line in open(os.path.join(os.path.dirname(__file__), "..", ".env")):
        if line.startswith("APIFY_API_TOKEN="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("no APIFY_API_TOKEN")


def api(method, path, tok, body=None):
    url = f"{APIFY_BASE}{path}"
    url += ("&" if "?" in url else "?") + "token=" + tok
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


def main():
    tok = token()
    urls = [{"url": u} for _, u in POSTS]
    payload = {
        "directUrls": [u for _, u in POSTS],
        "resultsType": "posts",
        "resultsLimit": 1,
        "addParentData": False,
    }
    print(f"Starting Apify run: {ACTOR}  ({len(POSTS)} Reels)")
    status, run = api("POST", f"/acts/{ACTOR}/runs", tok, payload)
    print(f"  start HTTP {status}")
    run_id = run["data"]["id"]
    ds_id = run["data"]["defaultDatasetId"]
    print(f"  runId={run_id}  datasetId={ds_id}")

    # Poll
    t0 = time.time()
    while True:
        time.sleep(6)
        _, r = api("GET", f"/actor-runs/{run_id}", tok)
        st = r["data"]["status"]
        print(f"  status={st}  ({time.time()-t0:.0f}s)")
        if st in ("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"):
            break
        if time.time() - t0 > 300:
            print("  giving up after 300s")
            break

    rd = r["data"]
    usage_usd = rd.get("usageTotalUsd")
    stats = rd.get("stats", {})
    print(f"\n=== RUN RESULT ===")
    print(f"status={rd['status']}  usageTotalUsd={usage_usd}")
    print(f"computeUnits={stats.get('computeUnits')}  runtimeSecs={stats.get('runTimeSecs')}")

    # Fetch dataset items
    _, items = api("GET", f"/datasets/{ds_id}/items?clean=true", tok)
    print(f"\nretrieved {len(items)} item(s)")

    outdir = os.path.join(os.path.dirname(__file__), "apify_out")
    os.makedirs(outdir, exist_ok=True)

    for i, it in enumerate(items):
        cap = it.get("caption") or ""
        video = it.get("videoUrl")
        display = it.get("displayUrl")
        hashtags = it.get("hashtags") or []
        typ = it.get("type")
        vplay = it.get("videoPlayCount")
        print(f"\n--- item {i}  shortCode={it.get('shortCode')}  type={typ} ---")
        print(f"  ownerUsername : {it.get('ownerUsername')}")
        print(f"  caption chars : {len(cap)}")
        print(f"  caption head  : {cap[:180].replace(chr(10),' ')!r}")
        print(f"  videoUrl?     : {'YES' if video else 'NO'}  {str(video)[:80]}")
        print(f"  displayUrl?   : {'YES' if display else 'NO'}  {str(display)[:80]}")
        print(f"  hashtags      : {hashtags[:10]}")
        print(f"  videoDuration : {it.get('videoDuration')}")
        print(f"  all keys      : {sorted(it.keys())}")
        if cap:
            with open(os.path.join(outdir, f"caption_{i}_{it.get('shortCode')}.txt"), "w") as fh:
                fh.write(cap)

    # dump raw for the record
    with open(os.path.join(outdir, "raw_items.json"), "w") as fh:
        json.dump(items, fh, indent=2)
    print(f"\nwrote captions + raw_items.json to {outdir}")


if __name__ == "__main__":
    main()
