const ACTOR = "apify~instagram-scraper";
const BASE = "https://api.apify.com/v2";

export type InstagramMedia = {
  caption: string;
  videoUrl: string | null;
  imageUrl: string | null;
  handle: string | null;
  costCents: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The Instagram retrieval leaf. Isolated and circuit-breakered: any failure —
 * no token, run error, timeout, empty result — resolves to null so the rest of
 * the app never depends on Meta staying reachable. This is a paid third-party
 * scraper (ToS grey area); keep it here and nowhere else.
 */
export async function fetchInstagram(url: string): Promise<InstagramMedia | null> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return null;

  let runId: string | null = null;
  let succeeded = false;

  try {
    const startRes = await fetch(`${BASE}/acts/${ACTOR}/runs?token=${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        directUrls: [url],
        resultsType: "posts",
        resultsLimit: 1,
        addParentData: false,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!startRes.ok) return null;

    const run = await startRes.json();
    runId = run.data.id as string;
    const datasetId: string = run.data.defaultDatasetId;

    // Poll for completion, capped so a hung run can't hang the request.
    const deadline = Date.now() + 60_000;
    let status = run.data.status as string;
    let usageUsd = 0;
    while (Date.now() < deadline) {
      await sleep(3_000);
      const poll = await fetch(`${BASE}/actor-runs/${runId}?token=${token}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!poll.ok) continue;
      const body = await poll.json();
      status = body.data.status;
      usageUsd = body.data.usageTotalUsd ?? usageUsd;
      if (["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status)) break;
    }
    if (status !== "SUCCEEDED") return null;
    succeeded = true;

    const itemsRes = await fetch(`${BASE}/datasets/${datasetId}/items?clean=true&token=${token}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!itemsRes.ok) return null;

    const items = await itemsRes.json();
    const item = Array.isArray(items) ? items[0] : null;
    if (!item) return null;

    return {
      caption: (item.caption as string) ?? "",
      videoUrl: (item.videoUrl as string) ?? null,
      imageUrl: (item.displayUrl as string) ?? null,
      handle: (item.ownerUsername as string) ?? null,
      costCents: usageUsd * 100,
    };
  } catch {
    return null;
  } finally {
    // Any started run that didn't reach SUCCEEDED — timed out, errored, or we
    // gave up polling — is aborted so Apify stops billing compute we won't read.
    if (runId && !succeeded) {
      try {
        await fetch(`${BASE}/actor-runs/${runId}/abort?token=${token}`, {
          method: "POST",
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        // best effort
      }
    }
  }
}
