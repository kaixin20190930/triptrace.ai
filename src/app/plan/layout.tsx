import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plan and usage",
  description: "See what your Life Atlas plan includes and how much of it you have used.",
  alternates: { canonical: "/plan" },
  // Private account surface, not a marketing page.
  robots: { index: false, follow: false },
};

export default function PlanLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
