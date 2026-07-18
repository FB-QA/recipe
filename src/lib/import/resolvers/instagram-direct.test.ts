import { describe, expect, it } from "vitest";
import { detectLoginShell, parseInstagramHtml, classifyInstagramUrl } from "./instagram-direct";

const CAPTION = 'Krissy on Instagram: "One-pan orzo. Ingredients: 500g chicken, 250g orzo. Method: brown, simmer 12 min."';

function postHtml({
  ogTitle = CAPTION,
  ogImage = "https://scontent.cdninstagram.com/x.jpg",
  ogVideo = "",
  extra = "",
}: { ogTitle?: string; ogImage?: string; ogVideo?: string; extra?: string } = {}) {
  return `<!DOCTYPE html><html><head>
    ${ogTitle ? `<meta property="og:title" content="${ogTitle.replace(/"/g, "&quot;")}" />` : ""}
    ${ogImage ? `<meta property="og:image" content="${ogImage}" />` : ""}
    ${ogVideo ? `<meta property="og:video" content="${ogVideo}" />` : ""}
    <title>Instagram</title></head><body>${extra}</body></html>`;
}

/** §27 fixture 9 — the live-probed login wall: HTTP 200, big body, login-shell
 *  markers, zero OG tags, zero caption JSON. */
const LOGIN_SHELL = `<!DOCTYPE html><html><head><title>Instagram</title></head>
  <body><div id="loginForm"></div><script>{"loginPage":true,"viewer":null}</script>
  ${"<div>padding</div>".repeat(200)}</body></html>`;

describe("detectLoginShell — never judge success by status code or byte count", () => {
  it("detects the login shell despite a 200 and a large body", () => {
    expect(detectLoginShell(LOGIN_SHELL)).toBe(true);
  });

  it("does not flag a real post page carrying OG data", () => {
    expect(detectLoginShell(postHtml())).toBe(false);
  });
});

describe("parseInstagramHtml", () => {
  it("extracts caption and creator from OG data", () => {
    const p = parseInstagramHtml(postHtml());
    expect(p.caption).toMatch(/One-pan orzo/);
    expect(p.creatorName).toBe("Krissy");
    expect(p.postType).toBe("single_image");
    expect(p.warnings).not.toContain("login_wall_detected");
  });

  it("emits login_wall_detected on the login shell", () => {
    const p = parseInstagramHtml(LOGIN_SHELL);
    expect(p.warnings).toContain("login_wall_detected");
    expect(p.caption).toBeNull();
  });

  it("flags a caption ending in a truncation marker", () => {
    const truncated = postHtml({
      ogTitle: 'Krissy on Instagram: "Ingredients: 500g chicken, 250g orzo, 1 tbsp… more"',
    });
    const p = parseInstagramHtml(truncated);
    expect(p.warnings).toContain("caption_may_be_truncated");
  });

  it("recognises a carousel and reports missing slides as partial evidence", () => {
    const carousel = postHtml({ extra: '<script>{"edge_sidecar_to_children":{"edges":[]}}</script>' });
    const p = parseInstagramHtml(carousel);
    expect(p.postType).toBe("carousel");
  });

  it("recognises a reel via og:video", () => {
    const reel = postHtml({ ogVideo: "https://scontent.cdninstagram.com/v.mp4" });
    expect(parseInstagramHtml(reel).postType).toBe("reel");
  });

  it("flags private and removed pages distinctly", () => {
    const priv = postHtml({ ogTitle: "", extra: '<script>{"is_private":true}</script>' });
    expect(parseInstagramHtml(priv).warnings).toContain("private_content");
    const gone = `<html><head><title>Page Not Found • Instagram</title></head><body>Sorry, this page isn't available.</body></html>`;
    expect(parseInstagramHtml(gone).warnings).toContain("deleted_content");
  });

  it("degrades to source_format_changed when the structure is unrecognised, and keeps going", () => {
    const weird = `<html><head><meta property="og:image" content="https://x.test/i.jpg"/></head><body><b>???</b></body></html>`;
    const p = parseInstagramHtml(weird);
    expect(p.warnings).toContain("source_format_changed");
  });
});

describe("classifyInstagramUrl", () => {
  it("classifies post, reel and tv paths", () => {
    expect(classifyInstagramUrl("https://www.instagram.com/p/abc/")).toBe("instagram_post");
    expect(classifyInstagramUrl("https://www.instagram.com/reel/abc/")).toBe("instagram_reel");
    expect(classifyInstagramUrl("https://instagram.com/tv/abc/")).toBe("instagram_reel");
  });

  it("returns null for non-instagram URLs", () => {
    expect(classifyInstagramUrl("https://example.com/p/abc/")).toBeNull();
  });
});
