"use client";

import Link from "next/link";
import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";

export default function LandingNav() {
  const { isSignedIn } = useAuth();
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-white/[0.05]">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white font-bold text-sm transition-transform group-hover:scale-105">
            A
          </div>
          <span className="font-display text-[18px] font-bold tracking-tight text-foreground">
            Athena
          </span>
        </Link>

        {/* Right */}
        <div className="flex items-center gap-4">
          <Link
            href="#features"
            className="text-[14px] text-muted hover:text-foreground transition-colors hidden sm:block"
          >
            Features
          </Link>
          {isSignedIn ? (
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-black transition-all hover:bg-white/90 hover:scale-[1.02]"
              >
                Go to Dashboard
              </Link>
              <UserButton />
            </div>
          ) : (
            <>
              <SignInButton mode="modal">
                <button className="text-[14px] text-muted hover:text-foreground transition-colors hidden sm:block">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-black transition-all hover:bg-white/90 hover:scale-[1.02]">
                  Get started free
                </button>
              </SignUpButton>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
