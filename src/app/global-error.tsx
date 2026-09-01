"use client";

export default function GlobalError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: 24 }}>
        <main style={{ maxWidth: 720, margin: "0 auto", paddingTop: 80 }}>
          <h1 style={{ fontSize: 32, marginBottom: 12 }}>Something went wrong.</h1>
          <p style={{ color: "#555", lineHeight: 1.6, marginBottom: 24 }}>
            TripTrace hit an unexpected runtime error. Please try again.
          </p>
          <pre style={{ whiteSpace: "pre-wrap", background: "#f5f5f5", padding: 16, borderRadius: 12 }}>
            {error.message}
          </pre>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              borderRadius: 999,
              padding: "12px 18px",
              border: "1px solid #222",
              background: "#222",
              color: "#fff",
              fontWeight: 600,
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
