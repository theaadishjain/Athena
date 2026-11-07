import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import "./globals.css";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";

export const metadata: Metadata = {
  title: "Athena — AI Study Partner",
  description:
    "Your quiet AI study partner. Chat, summarize lectures with page citations, plan around your weak spots, and review flashcards on a spaced-repetition schedule — five specialist agents.",
  keywords: ["study", "AI", "academic", "assistant", "notes", "planner"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        // Clerk v7 reads `theme`; the old `baseTheme` key is ignored.
        theme: dark,
        variables: {
          fontFamily: "'Figtree', system-ui, sans-serif",
          colorPrimary: "#ede8dc",
          colorPrimaryForeground: "#0a0a0c",
          colorBackground: "#111114",
          colorForeground: "#ede8dc",
          colorMutedForeground: "rgba(237,232,220,0.64)",
          colorInput: "#16161a",
          colorInputForeground: "#ede8dc",
          borderRadius: "0.25rem",
        },
      }}
      // The dev Clerk instance is named "My Application"; say Athena instead.
      localization={{
        signIn: { start: { title: "Sign in to Athena", subtitle: "Welcome back! Sign in to continue studying" } },
        signUp: { start: { title: "Create your Athena account", subtitle: "Free to use. Sign up to start studying" } },
      }}
      afterSignOutUrl="/"
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
    >
      <html lang="en" className="h-full">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..600,0..100;1,9..144,300..600,0..100&family=Figtree:ital,wght@0,400..700;1,400..700&family=JetBrains+Mono:wght@400;500&display=swap"
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
