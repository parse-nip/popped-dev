import type { Metadata } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans, Sora } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "parse-nip · popped.dev",
  description:
    "Community-built developer portfolio. Locked facts, open design — chat with an AI agent to shape the site.",
  openGraph: {
    title: "parse-nip · popped.dev",
    description: "A developer portfolio built by visitors, powered by AI.",
    url: "https://popped.dev",
    siteName: "popped.dev",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${plusJakarta.variable} ${sora.variable} min-h-screen antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
