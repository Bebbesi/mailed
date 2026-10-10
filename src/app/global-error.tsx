"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ fontSize: 13, color: "#6b6b74" }}>An unexpected error occurred. Try again in a moment.</p>
          <button onClick={reset} style={{ marginTop: 12, padding: "8px 14px", borderRadius: 6, border: "1px solid #d4d4d8", background: "#fff", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
