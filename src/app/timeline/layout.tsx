import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your Timeline",
  description: "Revisit the private traces in your Life Atlas across time.",
  alternates: { canonical: "/timeline" },
  robots: { index: false, follow: false },
};

export default function TimelineLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
