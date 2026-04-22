import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import "./globals.css";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";

export const metadata: Metadata = {
  title: "Athena — AI Study Partner",
  description:
    "Your quiet AI study partner. Chat, summarize lectures, plan your week, and generate flashcards with four specialized agents.",
  keywords: ["study", "AI", "academic", "assistant", "notes", "planner"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider appearance={{ baseTheme: dark }} afterSignOutUrl="/" signInUrl="/sign-in" signUpUrl="/sign-up">
      <html lang="en" className="h-full">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap"
            rel="stylesheet"
          />
        </head>
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
