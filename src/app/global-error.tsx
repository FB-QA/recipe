"use client";

import { useEffect } from "react";
import { canRecoveryReload, forceReload, guardedReload, isDeployError, updateSeen } from "@/lib/version/version";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  const deploy = isDeployError(error) || updateSeen();
  // Root-level deploy error → recover onto the new build with one guarded reload. Only
  // spin if a reload will actually fire (not recently reloaded, and loop-guardable).
  const recovering = deploy && canRecoveryReload();
  useEffect(() => {
    if (deploy && canRecoveryReload()) guardedReload();
  }, [error, deploy]);

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
          {/* A deploy skew is only fixed by a hard reload onto the live build; reset()
              re-renders the same mismatched tree. Route the button accordingly. */}
          <button
            onClick={deploy ? () => forceReload() : reset}
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
