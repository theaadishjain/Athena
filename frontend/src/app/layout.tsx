import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import "./globals.css";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";

export const metadata: Metadata = {
  title: "Athena — AI-Powered Academic Assistant",
  description:
    "Your personal AI study companion. Manage tasks, summarize lectures, and get personalized study guidance with adaptive memory.",
  keywords: ["study", "AI", "academic", "assistant", "notes", "planner"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider appearance={{ baseTheme: dark }} afterSignOutUrl="/">
      <html lang="en" className="h-full">
        <body
          className="noise-overlay min-h-full flex flex-col antialiased"
          suppressHydrationWarning={true}
        >
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
