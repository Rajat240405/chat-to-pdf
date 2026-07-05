import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "PromptPress — Turn AI Conversations into Technical Documentation",
  description: "Convert ChatGPT conversations into clean, export-ready documentation. Save, organize, and export as PDF in seconds.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-slate-900 antialiased min-h-screen">{children}</body>
    </html>
  );
}
