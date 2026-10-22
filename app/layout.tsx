import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope, Noto_Sans_Devanagari } from "next/font/google";
import { getLocale } from "@/lib/i18n/server";
import { site } from "@/lib/config/site";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], display: "swap" });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], display: "swap", axes: ["opsz", "SOFT"] });
const devanagari = Noto_Sans_Devanagari({ variable: "--font-devanagari", subsets: ["devanagari"], weight: ["400", "500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: { default: `${site.brand.name} — ${site.brand.tagline}`, template: `%s · ${site.brand.name}` },
  description: `${site.brand.supporting} ${site.brand.valueProposition}`,
  applicationName: site.brand.name,
};

export const viewport: Viewport = {
  themeColor: "#faf7f1",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${manrope.variable} ${fraunces.variable} ${devanagari.variable} antialiased`}>
      <body className="min-h-dvh">
        <div className="ambient" aria-hidden />
        {children}
      </body>
    </html>
  );
}
