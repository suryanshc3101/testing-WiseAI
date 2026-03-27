import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WiseAI — Agentic Sales Intelligence",
  description:
    "AI-powered B2B sales intelligence platform with 6 agent workflows",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="h-full bg-[#060a13]">{children}</body>
    </html>
  );
}
