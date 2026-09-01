import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-context";
import { LanguageProvider } from "@/lib/i18n";

const displayFont = Cormorant_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

const bodyFont = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://triptrace.ai"),
  title: {
    default: "TripTrace.ai | Turn memories into a living Life Atlas",
    template: "%s | TripTrace.ai",
  },
  description:
    "Turn scattered photos and notes into a private, searchable map and timeline of your life. Every trip leaves traces. Every trace tells a story.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "TripTrace.ai",
    title: "TripTrace.ai | Turn memories into a living Life Atlas",
    description:
      "Turn scattered photos and notes into a private, searchable map and timeline of your life.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "TripTrace.ai | Turn memories into a living Life Atlas",
    description:
      "Turn scattered photos and notes into a private, searchable map and timeline of your life.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <LanguageProvider>
            <AuthProvider>
              {children}
              <Toaster />
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
