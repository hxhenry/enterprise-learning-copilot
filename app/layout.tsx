import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enterprise Learning Copilot · v0.2 Presentation Demo",
  description:
    "A presentation-ready, pre-production agentic AI integration demo built with Next.js, TypeScript, LangGraph, typed SSE, RAG, tools, and human approval.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
