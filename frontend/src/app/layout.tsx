import type { Metadata } from "next";
import { Outfit, Space_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import "./globals.css";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

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
      <html
        lang="en"
        className={`${outfit.variable} ${spaceGrotesk.variable} h-full`}
      >
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
