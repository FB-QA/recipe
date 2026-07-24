"use client";

import { useDeployRecovery } from "@/lib/version/use-deploy-recovery";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  const { recovering, recover } = useDeployRecovery(error, reset);

  if (recovering) {
    return (
      <html lang="en">
        <body style={{ minHeight: "100dvh", background: "#f1f2ec" }} />
      </html>
    );
  }

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "24px",
          background: "#f1f2ec",
          color: "#17201a",
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ marginTop: 8, color: "#49554b" }}>Please reload the app.</p>
          {/* `recover` hard-reloads on a deploy skew (the only fix) and retries via
              reset() on a genuine error — the shared decision lives in the hook. */}
          <button
            onClick={recover}
            style={{
              marginTop: 20,
              padding: "12px 20px",
              borderRadius: 14,
              border: "none",
              background: "#1e5a43",
              color: "#fff",
              fontWeight: 700,
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
