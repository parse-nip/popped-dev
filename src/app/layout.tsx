import type { Metadata } from "next";
import "./globals.css";
import "./design-overrides.css";

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
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
