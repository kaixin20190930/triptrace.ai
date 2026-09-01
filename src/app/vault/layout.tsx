import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Atlas",
  description: "Search and revisit the private traces in your Life Atlas.",
  alternates: { canonical: "/vault" },
  robots: { index: false, follow: false },
};

export default function VaultLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
