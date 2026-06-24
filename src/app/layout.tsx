import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chat2PDF — Turn AI Conversations into Technical Documentation",
  description: "Instantly convert links from ChatGPT, Claude, and Gemini into professionally formatted, vector-ready PDF technical manuals and docs.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-slate-900 antialiased min-h-screen">{children}</body>
    </html>
  );
}
