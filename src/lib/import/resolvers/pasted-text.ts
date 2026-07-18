import { createHash } from "node:crypto";
import type {
  ImportRequest,
  ResolverContext,
  SourceResolver,
  SourceResolverResult,
} from "../schema";

/**
 * §12 — pasted text. The trivial resolver: the user already handed us the
 * source, so there is nothing to fetch. We normalise whitespace and wrap it as
 * `complete` text evidence; the evidence gate (§10) still decides whether it
 * carries a real recipe signal before any AI money is spent. Zero third-party
 * cost, still recorded per §23.
 */

export const MAX_TEXT_CHARS = 100_000;

function normaliseWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export const pastedTextResolver: SourceResolver = {
  resolverId: "pasted_text",
  providerId: null,
  serviceId: null,

  supports(request: ImportRequest): boolean {
    return request.sourceKind === "pasted_text" && (request.text?.trim().length ?? 0) > 0;
  },

  async resolve(request: ImportRequest, _context: ResolverContext): Promise<SourceResolverResult> {
    const text = normaliseWhitespace(request.text ?? "").slice(0, MAX_TEXT_CHARS);
    return {
      evidence: {
        sourceType: "pasted_text",
        sourceUrl: null,
        retrievalStatus: text.length > 0 ? "complete" : "unavailable",
        resolverId: "pasted_text",
        resolverAttemptId: "",
        caption: text.length > 0 ? text : null,
        title: null,
        creatorName: null,
        media: [],
        evidenceWarnings: [],
        contentFingerprint: text.length > 0 ? createHash("sha256").update(text).digest("hex").slice(0, 32) : null,
        retrievedAt: new Date().toISOString(),
      },
      cost: null,
      failure: text.length > 0 ? null : "invalid_input",
    };
  },
};
