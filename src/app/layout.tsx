import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Gloock, Martian_Mono } from "next/font/google";
import { themeScript } from "@/ui/theme";
import { DemoBanner } from "@/ui/demo-banner";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const gloock = Gloock({ weight: "400", subsets: ["latin"], variable: "--font-gloock", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const martian = Martian_Mono({ subsets: ["latin"], variable: "--font-martian", display: "swap" });

export const metadata: Metadata = {
  title: { default: BRAND.academyName, template: `%s · ${BRAND.academyName}` },
  description: `${BRAND.academyName} — practical Health & Safety and AI & Digital training from ${BRAND.companyName}.`,
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F5F0" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0B0C" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-ZA"
      className={`${gloock.variable} ${bricolage.variable} ${martian.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="bg-inverse text-on-inverse sr-only z-50 px-4 py-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
