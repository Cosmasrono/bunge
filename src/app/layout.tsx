import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Every page is personal and carries a per-request security nonce, so render on each request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: process.env.APP_NAME || "PRS", template: `%s · ${process.env.APP_NAME || "PRS"}` },
  description: "Your schedule, with reminders by email and notification.",
  robots: { index: false, follow: false },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
  appleWebApp: { capable: true, title: process.env.APP_NAME || "PRS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1210" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
