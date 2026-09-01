import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 32 }}>
      <h1 style={{ fontSize: 32, marginBottom: 12 }}>Page not found</h1>
      <p style={{ color: "#555", marginBottom: 20 }}>
        The page you are looking for does not exist.
      </p>
      <Link href="/">Go home</Link>
    </main>
  );
}
