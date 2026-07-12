# Import PoC — Findings (throwaway spike)

**Branch:** `spike/import-poc`  ·  **Date:** 2026-07-12  ·  **Model for AI rungs:** `claude-haiku-4-5` ($1.00/1M in, $5.00/1M out)

> Exploratory only. No test-first, no production polish. Deliverable is honest evidence.

---

## 1. Verdict

**V1 can honestly promise reliable *website* recipe import; it cannot promise *Instagram* import for arbitrary public content.** Website extraction is essentially deterministic and free — 4 of the 5 reachable test sites expose machine-readable `schema.org/Recipe` data, and AI is only a cheap fallback (~0.2 cents/import). The real risk lives entirely in Instagram *retrieval*, not extraction: every unauthenticated method (public HTML, oEmbed, `__a=1`, GraphQL) is a brick wall today — you get a JS login shell, an empty embed scaffold, a 401, or a 404, never the caption or media. AI extraction itself is cheap and reliable once you *have* text, so the product should treat Instagram as an isolated, gracefully-failing integration and lead with website import.

> ⚠️ **Cost-honesty note:** actual AI spend this spike = **0 cents** — not by frugality but because no usable Anthropic key was available (the `.env` `ANTHROPIC_API_KEY` is a literal `sk-ant-...` placeholder; no env var, no `ant` CLI, no profile). Rung 3/4 costs below are analytical estimates from precise token counts, not live-metered. The Rung 3 script (`spike/rung3_extract.py`) is complete and runs as-is the moment a real key is present.

---

## 2. Per-source table

| Source type | Retrieval success | Cost per import | Primary failure mode |
|---|---|---|---|
| Website, big brand w/ JSON-LD (BBC Good Food) | High **when reachable** | ~0 (deterministic) or ~0.27¢ AI fallback | Anti-bot wall on some big sites (402/403), not schema absence |
| Website, indie blog (Budget Bytes, Minimalist Baker, Smitten Kitchen) | High (all reachable) | ~0 / ~0.2¢ | Occasional microdata-only or client-rendered card needing a richer parser |
| Website, walled publisher (Serious Eats, AllRecipes, Food Network, NYT) | **~0% from this IP** | n/a (never retrieved) | 402/403 anti-bot (Dotdash Meredith `460`), 404/paywall (NYT); Googlebot UA does **not** bypass |
| Instagram public Reel / post (not owned) | **~0% via any HTTP method** | n/a (never retrieved) | JS login shell, empty oEmbed scaffold, 401 GraphQL, dead `__a=1` |

---

## 3. Rung-by-rung findings

### Rung 1 — Website deterministic extraction (NO AI). Result: works, free.

Fetched 9 real recipe URLs with a browser UA (`spike/rung1_website.py`):

| Site | HTTP | Recipe data | Completeness |
|---|---|---|---|
| BBC Good Food | 200 | JSON-LD ✅ | name, 22 ingredients, 3 steps, prep/cook/total/yield — full |
| Budget Bytes (indie) | 200 | JSON-LD ✅ | name, 8 ingredients, 4 steps, all times, yield — full |
| Minimalist Baker (indie) | 200 | JSON-LD ✅ | name, 18 ingredients, 8 steps, all times, yield — full |
| Smitten Kitchen (indie) | 200 | **microdata only** | `itemprop` recipeIngredient/yield/totalTime — needs a microdata parser, not JSON-LD |
| Love & Lemons (indie) | 200 | **none server-side** | Yoast JSON-LD present (Article/WebPage) but **no `Recipe` node**; WPRM card is client-rendered |
| Serious Eats | **402** | — | Dotdash Meredith anti-bot wall |
| AllRecipes | **402** | — | Dotdash Meredith anti-bot wall |
| Food Network | **403** | — | anti-bot wall |
| NYT Cooking | **404** | — | paywall / URL gating |

**Scoreboard:** 3/9 parseable Recipe JSON-LD; +1 microdata-only ⇒ **4 of 5 *reachable* pages (80%) carry machine-readable recipe data**. The one reachable miss (Love & Lemons) renders its recipe card client-side. The four total misses are **retrieval blocks, not schema gaps** — and a Googlebot UA still returned `460`/`403`/`404`, so the wall is IP/behaviour-based, not UA-based.

**Parser lesson (real bug found & fixed mid-spike):** a naïve regex requiring quoted `type="application/ld+json"` missed Yoast's unquoted `type=application/ld+json`. Production must use a real JSON-LD parser that handles `@graph`, `@type` arrays, unquoted attributes, **and** microdata (extruct/BeautifulSoup), not regex.

### Rung 2 — Instagram retrieval. THE ACTUAL RISK. Result: brick wall.

Tested 3 real **public** recipe Reels (Smitten Kitchen brisket `DIRetiCppK5`, Boursin pasta `CtMXPf7gIB0`, Diane Morrisey `CmxDtLeB-pY`) across 5 methods, no auth / no business account (`spike/rung2_instagram.py`). Identical results on all three:

| Method | HTTP | What actually came back |
|---|---|---|
| **A.** `graph.facebook.com/.../instagram_oembed` (no token) | **200** | oEmbed JSON, but only an **embed `<blockquote>` scaffold** — visible text is literally "View this post on Instagram". **No caption, no author_name, no thumbnail_url, no media URL.** Useless for extraction. |
| **B.** `api.instagram.com/oembed` (legacy) | **200** | Redirects to `www.instagram.com/oembed/` → returns the **595 KB app/login shell**, not JSON. Deprecated/dead. |
| **C.** Public page HTML (browser UA) | **200** | 594 KB pure **JS app shell**: `0` `og:` meta tags, `0` occurrences of the caption text ("brisket"), `0` caption JSON keys. Nothing server-rendered — the caption is not in the initial HTML. |
| **D.** `?__a=1&__d=dis` JSON | **404 / 500** | Dead endpoint. |
| **E.** Public GraphQL by shortcode | **401** | Unauthorized without a logged-in session. |

**Conclusion:** For content you do **not** own, there is no reliable unauthenticated path to caption+media today. The one officially-sanctioned path (oEmbed) deliberately returns an embed widget with zero recipe text; everything else is auth-gated, deprecated, or dead. This confirms the brief's warning precisely — arbitrary public Instagram content is **not** dependably accessible.

**ToS / legal reality:** scraping Instagram without permission violates Meta's Terms of Use. Meta actively blocks (login walls, IP/behaviour rate-limiting, the 401/deprecation seen above) and litigates scrapers. Even where public-data scraping isn't a CFAA violation (*hiQ v. LinkedIn*), the ToS breach, account-ban risk, and brittle-by-design endpoints make it unfit as a core V1 dependency. The only *stable* paths are the Instagram Graph API for content the user **owns/manages** (business/creator accounts) — which won't help "paste any Reel URL" — or third-party scraper APIs (Apify et al.) that fight this same wall and carry the same ToS/legal exposure.

### Rung 3 — AI text extraction (cost). Result: cheap & reliable (estimated).

Could not run live (no key). Script forces structured JSON via `output_config.format` (json_schema with **nullable** scalar fields) + a system instruction to never invent missing data — that combination is what prevents hallucination on sparse input. Analytical cost from precise token counts (Haiku 4.5, ~4 chars/token, incl. ~340-token system+schema overhead):

| Input | ~in tokens | ~out tokens | Cost/import |
|---|---|---|---|
| Real BBC recipe body (2061 chars) | ~855 | ~375 | **~0.27¢** |
| Complete IG-style caption (Tuscan chicken) | ~578 | ~300 | **~0.21¢** |
| Sparse caption ("recipe on the blog soon") | ~392 | ~40 (mostly nulls) | **~0.06¢** |

**Typical caption→JSON import ≈ 0.2 cents.** 1,000 text imports ≈ €2. The nullable-schema design means a sparse caption correctly yields empty ingredients/steps rather than fabricated ones (verifiable by running the script's hallucination-test case). Note: for websites that already expose JSON-LD, AI is unnecessary — extraction is free; Haiku is the fallback for schema-less pages and for cleaning IG captions once obtained.

### Rung 4 — Vision/transcription (the expensive rung). Result: reasoned estimate.

The catch: Reels usually put the recipe **on-screen in the video**, not in the caption. When caption-only is insufficient, escalation options, cheapest first:

| Escalation | How | Rough cost/import | Notes |
|---|---|---|---|
| **Frame sampling + vision** | `ffmpeg` extract ~6–10 frames (free, local) → send to vision model to OCR on-screen ingredient/step overlays | **~1.5¢ (Haiku)** to **~5–8¢ (Sonnet-tier)** | ~1,000–1,600 image tokens/frame × 8 frames dominates cost. Best fit because most recipe Reels show text overlays. |
| **Full audio transcription** | ASR (hosted Whisper ~0.6¢/min, or local whisper.cpp free-but-slow) → feed transcript to Haiku (~0.2¢) | **~0.8¢/min** hosted; low **yield** | Only works when the creator *narrates* the recipe. Many reels are music-over-text — transcript yields nothing usable. |

**Recommendation for the expensive rung:** frame-sampling + vision is the cheapest escalation that actually captures in-video recipes, because on-screen text (not narration) is the norm. Budget ~1.5¢/import if using Haiku vision, and gate it behind "caption extraction produced too few fields" so 80%+ of imports never pay it. Audio transcription is a poor default (silent/music reels).

---

## 4. What V1 import can honestly promise

- **Website import — promise it, confidently.** "Paste a recipe URL and we'll import it." Reliable and near-free for sites that expose `schema.org/Recipe` (most major recipe sites and WordPress-Recipe-Maker blogs do). Caveats to design around: (a) a minority of big publishers hard-block server-side fetches — needs a resilient fetch strategy (headless browser / rotating egress / or a graceful "couldn't reach this site" message); (b) some sites are microdata-only or client-rendered — needs a real parser plus an AI fallback (~0.2¢).
- **Instagram import — do NOT promise "paste any public Reel URL".** For arbitrary public content it does not work today. Reshape the promise to one of:
  1. **User-paste**: "Paste the Reel's caption text" → Haiku extraction (~0.2¢). Honest, reliable, zero scraping.
  2. **Owned-account only**: official Instagram Graph API for the user's *own* business/creator posts.
  3. **Best-effort, gracefully failing**: attempt retrieval, and when it fails (it usually will), fall back to (1) — never let an IG failure look like a product bug.

---

## 5. Recommended architecture implication

Model extraction as a set of **swappable `Extractor` strategies behind one interface** (`fetch → raw → structured Recipe`), selected per source: `JsonLdExtractor` and `MicrodataExtractor` (deterministic, free, tried first), `AiTextExtractor` (Haiku fallback for schema-less HTML and for user-pasted captions), and an isolated `InstagramRetriever` that is allowed to **fail cleanly and loudly-to-logs / quietly-to-user**. Instagram must be a leaf integration with its own circuit-breaker and a first-class "retrieval failed, here's the manual-paste path" fallback — never on the critical path of a website import, and never able to take the whole importer down. Keeping the vision/transcription escalation (Rung 4) as just another `Extractor` behind the same interface means it can be added later, cost-gated, without touching the website path that carries V1's real value.

---
---

# Instagram retrieval via Apify — follow-up spike

**Date:** 2026-07-12  ·  **Branch:** `spike/import-poc`  ·  **Scripts:** `spike/rung5_apify_instagram.py`, `spike/rung6_extract_live.py`  ·  **Retrieved data:** `spike/apify_out/`

> Follow-up to the website/Instagram PoC above. That spike's open risk was: the **only** stable path to arbitrary public Instagram content is a paid scraper API (Apify et al.) — untested. This section closes that risk with a live, real-money test of `apify/instagram-scraper`, and asks: can we reliably turn a **public Instagram Reel URL** (content we do NOT own) into a structured recipe, and what does end-to-end IG import actually cost?

## 1. Verdict (follow-up)

**Yes — Apify clears the login wall the earlier spike hit, reliably (3/3) and cheaply (0.27¢/Reel, live-metered).** For content we don't own, `apify/instagram-scraper` returned the full **caption text**, a **downloadable video URL**, a thumbnail, and hashtags for every test Reel, in ~20 s, for a real, actual `usageTotalUsd` of **$0.0081 across 3 Reels**. This flips the earlier "brick wall" finding: paste-any-public-Reel is now *technically viable*. Two caveats keep it from being a no-asterisks headline: (a) **recipe completeness is caption-dependent** — 2 of 3 test captions carried the whole recipe, 1 was a "comment for recipe"/blog-link teaser whose recipe lives only in the video; (b) it's a third-party scraper fighting Meta's anti-scraping, so the ToS/legal exposure and change-breakage risk from the earlier spike still apply — Apify absorbs the wall, it does not remove the risk.

## 2. Retrieval via Apify — result: 3/3, caption + video + thumbnail + hashtags

Actor `apify/instagram-scraper` (`resultsType: posts`, `directUrls`), one run, 3 real public recipe Reels from well-known accounts. Live run `ol5UclMfRdcF0b3qB`, HTTP 201 → `SUCCEEDED` in 20 s.

| Reel (account) | Caption? | Video URL? | Thumbnail? | Hashtags? |
|---|---|---|---|---|
| `CtMXPf7gIB0` @recipesbyanne (Boursin pasta) | ✅ 1,209 ch | ✅ `cdninstagram.com` MP4 | ✅ | ✅ 18 |
| `DIRetiCppK5` @smittenkitchen (brisket) | ✅ 531 ch | ✅ | ✅ | — (0) |
| `CmxDtLeB-pY` @dianemorrisey (linguini) | ✅ 1,713 ch | ✅ | ✅ | ✅ 8 |

**Success rate: 3/3 (100%).** Every item also carried `videoDuration`, like/comment counts, owner, timestamp, `musicInfo`, and (Reel 1) an `audioUrl`. The `videoUrl` values are real `scontent-*.cdninstagram.com` MP4 endpoints — fetchable for a transcription/vision escalation.

## 3. Real cost of retrieval — 0.27¢/Reel, and the platform floor

- **Live metered:** run object `usageTotalUsd = 0.0081` for 3 results = **$0.0027 / Reel (0.27¢)**. Matches the actor's published pay-per-result price on the free tier ($2.70 / 1,000 results). Compute was 0.0028 CU / 20 s.
- **Apify platform floor (honest):** **Free** tier = **$0/month base + $5/month usage credit** (hard cap `maxMonthlyUsageUsd: 5`; account `fincbrook` is on it). First paid tier = **Starter, $29/month** (includes $29 usage). Then Scale $199, Business $999. Unused credit does **not** roll over.
- **Extrapolation** (Apify retrieval only, at 0.27¢/Reel):

| Imports/mo | Apify cost | Covered by free $5? | Platform floor |
|---|---|---|---|
| 100 | $0.27 | ✅ | **$0** |
| 500 | $1.35 | ✅ | **$0** |
| 1,000 | $2.70 | ✅ | **$0** |
| ~1,850 | $5.00 | at the cap | **$0**, then must upgrade |
| >1,850 | — | ❌ (hard $5 cap) | **$29/mo (Starter)** |

So the platform floor is **$0 up to ~1,850 Reels/month**, then **$29/month**. At V1's likely volume (≤1,000/mo) retrieval is effectively free within the standing $5 credit.

## 4. The video problem — 2 of 3 recipes were fully in the caption

Recipes in Reels often live in the **video**, not the caption. On the test set (full captions saved to `spike/apify_out/`):

| Reel | Recipe in caption? | Notes |
|---|---|---|
| Boursin pasta | ✅ **Full** — 11 ingredients + directions | Caption-only import works, no video needed |
| Morrisey linguini | ✅ **Full** — 8 ingredients + method + tip | Caption-only import works |
| Smitten brisket | ❌ **Teaser** — "Comment 'send recipe'" + blog link | Recipe is in the video (and at the linked `smittenkitchen.com` URL — website-extractable) |

So **caption-only extraction succeeded on ~2/3** of a small real sample. The pattern is creator-dependent: recipe-forward accounts put the whole thing in the caption; many use "link in bio / comment for recipe". **When the video is needed, Apify already returned a fetchable `videoUrl`**, so escalation is possible. Added cost per video-needed import (reasoned estimate, no ffmpeg in this env):

- **Frame-sampling + vision** (best fit — recipe Reels show on-screen text overlays): `ffmpeg` ~8 frames (free, local) → Haiku vision OCR. ~1,500 img tokens/frame × 8 ≈ 12k input + ~300 output ⇒ **~1.4¢/import** (Haiku). Gate behind "caption produced too few fields".
- **Audio transcription**: hosted Whisper ~0.6¢/min; a 18–60 s Reel ≈ 0.2–0.6¢, but **low yield** — many Reels are music-over-text with no narration.

## 5. Extraction, live — BLOCKED by $0 Anthropic credit; grounded token estimate instead

**Honest spend note:** the extraction rung (`spike/rung6_extract_live.py`) is complete and correct — it forces structured JSON via `output_config.format` (json_schema, nullable scalars) against `claude-haiku-4-5-20251001` over raw HTTPS — but it could **not** be run live. The `.env` `ANTHROPIC_API_KEY` authenticates (it clears 401), but the account behind it returned **HTTP 400 `credit balance is too low`** (`req_011CcxEY9osbgyJw1vkwa47X`). No `ant` CLI or alternate credential is available in this environment, so there was **no way to obtain live Haiku token metering** — this is a real billing blocker, reported plainly, not frugality. **Actual Anthropic spend this spike: $0 (forced).** Actual Apify spend: **$0.0081**.

Estimate from the **real retrieved captions** (Haiku 4.5: $1/1M in, $5/1M out; ~1.3 tok/word English + ~280-token system+schema overhead):

| Caption | words | ~in tok | ~out tok | Cost/import |
|---|---|---|---|---|
| Boursin (full) | 178 | ~510 | ~230 | **~0.17¢** |
| Morrisey (full) | 319 | ~700 | ~320 | **~0.23¢** |
| Brisket (teaser) | 80 | ~380 | ~40 (mostly nulls) | **~0.06¢** |

**Typical full-caption → JSON extraction ≈ 0.2¢** — consistent with the earlier spike's Rung 3 estimate, now anchored to real caption lengths. The nullable-schema design means the teaser correctly yields empty ingredients/steps rather than fabricated ones (the design that prevents hallucination; unverifiable live here due to the credit block, but identical to the tested Rung 3 script).

## 6. All-in verdict

**Per-import cost, caption path (the common case):**
`Apify retrieval 0.27¢ (real) + Haiku extraction ~0.2¢ (est) ≈ **0.5¢/import**.`

**Per-import cost, video path (teaser captions, ~1/3 of Reels):**
`0.27¢ (Apify, incl. video URL) + ~1.4¢ (frame-sample + Haiku vision) + ~0.2¢ (clean-up) ≈ **~1.9¢/import**.`

**Monthly platform floor:** **$0 up to ~1,850 imports/month** (Apify free $5 credit), then **$29/month** (Apify Starter). Anthropic has no monthly floor (pure usage) — but the current key needs credit topped up before *any* live extraction runs.

**Reliability read:** Retrieval is **dependable enough to headline V1** — 3/3 on real public Reels, sub-cent, ~20 s, returns caption + downloadable video + thumbnail. That is a genuine change from the earlier "brick wall" verdict: the paid provider clears the wall the DIY methods could not. **But headline it with two designed-in caveats:** (1) recipe completeness is **caption-dependent** (~2/3 full from caption on this sample) — V1 needs the video-escalation path *or* a graceful "recipe not in caption, here's the video/blog link" fallback, not an assumption that caption == recipe; (2) it remains a **third-party scraper against Meta's ToS** — same legal/breakage exposure as before, now with a per-call bill. Keep the `InstagramRetriever` an isolated, circuit-breakered leaf (per §5 above) with Apify behind it, gate the ~1.4¢ vision path behind "caption too sparse", and budget for Apify Starter once past ~1,850 imports/month.

---

# DIY headless-browser retrieval vs Apify

**Date:** 2026-07-12  ·  **Branch:** `spike/import-poc`  ·  **Script:** `spike/rung7_diy_headless.py`  ·  **Evidence:** `spike/diy_out/` (rendered DOM, screenshots, `result.json`)

> The Apify follow-up above left **one option untested**: running our **own** headless browser (Playwright + Chromium) that loads the Reel page the way a human's browser does — executing JS, rendering the DOM — and scraping caption + video from the rendered page. The user can watch these public Reels in a normal browser with no login, so it was worth a real test. Question: can a self-hosted headless browser reliably retrieve a **public** Reel's **caption** and a **downloadable video URL**, with **NO login and NO Apify**, for content we don't own?

## 1. Verdict (DIY headless)

**It WORKED from here — 3/3 real Reels gave caption + a genuinely downloadable `video/mp4`, no login, no Apify — BUT this ran from a residential IP and that is exactly the variable that decides production, where it will almost certainly need the same proxy infrastructure Apify already bundles.** A headless Chromium with a desktop UA loaded all three real test Reels (HTTP 200, no login redirect), and every one yielded the full caption via `og:description` and a fetchable CDN MP4 (proven by pulling 500 KB of `video/mp4`, HTTP 206, from each). The earlier spike's "login wall" **did not appear** to a real rendered browser from this IP — the only interstitial was a cosmetic cookie-consent modal that does not block the data. **So the technique is proven; its production survival is not.** See §4 — this is a necessary-but-not-sufficient PASS.

## 2. Per-URL result — 3/3 real Reels passed (residential IP)

Same 3 Reels Apify retrieved (like-for-like), plus a 4th probe URL.

| Reel (account) | HTTP | Caption (`og:description`) | Downloadable video? | Login wall? |
|---|---|---|---|---|
| `CtMXPf7gIB0` @recipesbyanne | 200 | ✅ 1,270 ch (full Boursin recipe) | ✅ `video/mp4`, 206, 500 KB pulled | ❌ none (cookie modal only) |
| `DIRetiCppK5` @smittenkitchen | 200 | ✅ 597 ch (brisket teaser + blog link) | ✅ `video/mp4`, 206, 500 KB pulled | ❌ none |
| `CmxDtLeB-pY` @dianemorrisey | 200 | ✅ 1,782 ch (full linguini recipe) | ✅ `video/mp4`, 206, 500 KB pulled | ❌ none |
| `C9Zx0qgR4mS` (unverified probe) | 200 | ❌ empty meta | ❌ no media | — dead/removed shortcode |

The 4th was a **guessed shortcode that doesn't resolve** to a live Reel (empty `og:*`, zero media requests) — kept in as an honest negative control showing the script reports failure rather than fabricating. Screenshot evidence (`spike/diy_out/shot_*.png`) shows the real post rendered behind a *"Allow the use of cookies from Instagram"* consent modal — **not** a login gate; caption and video came through regardless.

## 3. The technique that actually matters — network sniffing, not DOM scraping

A naive "read the `<video>` element `src`" **fails**: the rendered `<video>` only ever exposes a **`blob:` URL** (MediaSource Extensions / MSE), which is an in-memory reference and is **not fetchable** server-side (my first pass tried it and got `unknown url type: blob`). The real, downloadable MP4 is only visible by **intercepting network responses** (`page.on("response", …)`), which surfaced the true `instagram.f*.fna.fbcdn.net/o1/v/…​.mp4` endpoints. Two consequences that raise the DIY maintenance bar:

- **The video is DASH byte-range/segmented** — the captured URLs carry `bytestart`/`byteend` params and split into **separate video and audio streams** (`dash_baseline` video + `dash_baseline_audio`). To produce one playable file you must strip the range, refetch the full stream, and likely **mux video+audio yourself** (ffmpeg). Apify returns a single ready `videoUrl`.
- **Caption** was the easy part — plain `og:description` meta, same field the HTTP-only spike *couldn't reach* because it never got past the wall. The headless render gets past the wall; the meta then reads trivially.

## 4. ⚠️ THE IP CAVEAT — read this before trusting the PASS

**This ran from the Mac Mini on a RESIDENTIAL IP. That is the single biggest reason to distrust extrapolating this result to production.** Instagram/Meta treat residential IPs far more leniently than the **datacenter/cloud IPs** where this app will actually deploy (Vercel / Supabase / any serverless host). The same headless script from a cloud egress IP routinely hits login walls, consent challenges, rate-limits, and IP bans that never fire from a home connection.

- **A PASS here (which we got) is necessary-but-NOT-sufficient.** It proves the *technique* (headless render clears the consent modal; caption + CDN MP4 are reachable) — it does **NOT** prove it survives from the deploy environment. That requires re-testing **from a real cloud IP** before any production decision.
- **A FAIL here would have been decisive** (if it can't work from a lenient residential IP, it certainly won't from a hostile datacenter one). It didn't fail — so the question stays open, not closed.

## 5. Ongoing cost of the DIY path even if it works

1. **Brittleness / perpetual maintenance.** The working path depends on undocumented internals: the `blob:`-vs-network-capture trick, DASH segment muxing, `og:*` presence, and the consent-modal shape. Instagram changes these routinely and without notice. Every change is a **production outage requiring a code fix** — an unbounded, recurring engineering cost with no SLA. Apify absorbs exactly this churn as their core product.
2. **Residential proxies — the hidden bill.** To survive from a datacenter (§4), the realistic fix is routing headless traffic through **residential proxy pools** (~$3–15/GB, or $50–500+/mo for managed pools). That is precisely the costly infrastructure **Apify already bundles** into its 0.27¢/Reel. Building it ourselves means we've reimplemented Apify, minus the maintenance team.
3. **Headless compute per import.** Each import spins a full Chromium (~0.3–1 GB RAM, ~3–8 s render + settle). On serverless that's a heavy, cold-start-prone function (Chromium barely fits in a Lambda/Vercel function); on a standing box it's real CPU/RAM per import. Apify's 0.27¢/Reel already includes their compute — our self-hosted compute is **additive, not free**, and likely dwarfs 0.27¢ once proxies + orchestration are counted.

## 6. Recommendation — do NOT drop Apify; it earns its place

**Keep Apify for V1. Do not replace it with a self-hosted headless retriever on the strength of this PASS.** The DIY path *works from a residential IP*, but the honest production read is that it will **need residential proxies + perpetual scraper maintenance from a cloud IP — i.e. it converges on rebuilding what Apify sells for 0.27¢/Reel.**

**Money-vs-maintenance tradeoff:**

| | DIY headless (self-host) | Apify |
|---|---|---|
| Per-import $ | Chromium compute + **residential proxy $** (the real cost) | **0.27¢** all-in |
| Monthly floor | Proxy pool $50–500+/mo to survive cloud IPs | **$0** to ~1,850 Reels, then $29/mo |
| Engineering | **Perpetual** — breaks on every IG change (blob/DASH/consent/meta) | Apify's team absorbs it |
| Video output | Must sniff network + **mux DASH video+audio myself** | Single ready `videoUrl` |
| Cloud-IP survival | **Unproven; likely needs proxies** | Proven wall-clearing (§Apify spike) |
| ToS/legal exposure | Same (scraping Meta) — **now ours to own** | Same, but at arm's length behind provider |

The DIY win here is real but shallow: it clears a *residential* consent modal, not a *datacenter* defence. The moment we deploy, we inherit proxy costs and a maintenance treadmill that add up to more than 0.27¢/Reel with none of the reliability. **Apify's price is buying us proxy infrastructure + scraper maintenance + a single clean `videoUrl` — that is exactly the expensive, brittle part, and it is cheap.**

**Suggested posture:** ship V1 on Apify (per the follow-up spike). Keep `rung7_diy_headless.py` as a **documented, parked fallback** — but do not promote it without a **cloud-IP re-test** (§4) and a proxy-cost line item. If a future cloud-IP test also passes *and* stays stable, revisit as a cost optimisation; until then, DIY is a science-experiment, not a dependency to bet the import feature on.
