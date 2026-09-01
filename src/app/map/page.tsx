import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { MapPageClient } from "@/components/map/map-page-client";

export const metadata: Metadata = {
  title: "Your Life Map",
  description: "See your private life traces across place and time.",
  alternates: { canonical: "/map" },
  robots: { index: false, follow: false },
};

export default function MapPage() {
  return (
    <AppShell>
      <MapPageClient />
    </AppShell>
  );
}

