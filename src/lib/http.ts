/**
 * A real desktop browser user-agent. Instagram's CDN (and some recipe sites)
 * refuse bare server fetches, so every outbound fetch that scrapes or pulls
 * media identifies with this.
 */
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Safari/605.1.15";
