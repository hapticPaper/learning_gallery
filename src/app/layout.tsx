import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GoogleTagManager } from "@next/third-parties/google";
import type { ReactNode } from "react";
import "./globals.css";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const gtmId = process.env.NEXT_PUBLIC_GTM_ID ?? "GTM-P43CMVDL";

export const metadata: Metadata = {
  title: {
    default: "Learning Gallery",
    template: "%s | Learning Gallery",
  },
  description: "A living gallery of machine learning experiments and approaches.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const isValidGtmId = /^GTM-[A-Z0-9]+$/.test(gtmId);
  const shouldLoadGtm = process.env.NODE_ENV === "production" && isValidGtmId;

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans`}
      >
        <div className="min-h-dvh bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
            {children}
          </main>
          <SiteFooter />
        </div>
      </body>
      {shouldLoadGtm ? <GoogleTagManager gtmId={gtmId} /> : null}
    </html>
  );
}
