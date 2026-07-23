/**
 * HTML entity decoding, shared across the import parsers.
 *
 * Recipe pages HTML-encode characters inside their JSON-LD strings and WPRM markup
 * — an apostrophe as `&#39;`, an en dash as `&ndash;`, a vulgar fraction as
 * `&frac13;`. JSON.parse leaves those literal (they aren't JSON-special), so
 * without this pass they'd store and render as raw entity text ("don&#39;t").
 *
 * Named entities cover punctuation, quotes/spaces, and the full set of HTML
 * vulgar-fraction names (recipes lean on these for quantities). `&amp;` is decoded
 * LAST so a double-encoded "&amp;#39;" resolves in the right order.
 */
const NAMED_ENTITIES: Record<string, string> = {
  "&ndash;": "–", "&mdash;": "—", "&hellip;": "…", "&lt;": "<", "&gt;": ">",
  "&rsquo;": "'", "&lsquo;": "'", "&rdquo;": '"', "&ldquo;": '"', "&quot;": '"', "&apos;": "'", "&nbsp;": " ",
  "&deg;": "°", "&times;": "×",
  "&frac12;": "½", "&frac13;": "⅓", "&frac14;": "¼", "&frac15;": "⅕", "&frac16;": "⅙", "&frac18;": "⅛",
  "&frac23;": "⅔", "&frac25;": "⅖", "&frac34;": "¾", "&frac35;": "⅗", "&frac38;": "⅜",
  "&frac45;": "⅘", "&frac56;": "⅚", "&frac58;": "⅝", "&frac78;": "⅞",
};
const NAMED_RE = new RegExp(Object.keys(NAMED_ENTITIES).join("|"), "g");

export const decodeEntities = (s: string): string =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(NAMED_RE, (m) => NAMED_ENTITIES[m])
    .replace(/&amp;/g, "&");

/** Strip tags to readable text: drop markup, decode entities, collapse whitespace. */
export const stripTags = (s: string): string =>
  decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
