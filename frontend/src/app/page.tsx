"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import LandingNav from "@/components/ui/LandingNav";

const TOOLS = [
  { label: "Studying", active: true },
  { label: "Homework", active: false },
  { label: "Notes", active: false },
  { label: "Essays", active: false },
];

const FEATURE_CARDS = [
  {
    title: "Chat",
    description: "Get instant, personalized help with any question. Athena remembers your context and learns how you study.",
    cta: "Chat with Athena",
    href: "/chat",
    bg: "bg-[var(--color-surface)] border border-[var(--color-border)]",
    textColor: "text-foreground",
    ctaColor: "bg-white text-black hover:bg-white/90",
  },
  {
    title: "Summarize",
    description: "Drop a 40-page PDF. Get the 5 things that matter in 10 seconds. Works with PDF, TXT, and Markdown files.",
    cta: "Summarize with Athena",
    href: "/notes",
    bg: "bg-[var(--color-surface)] border border-[var(--color-border)]",
    textColor: "text-foreground",
    ctaColor: "bg-white/10 text-white hover:bg-white/20",
  },
  {
    title: "Study Plan",
    description: "Tell it your exam dates. Athena builds a realistic schedule that adapts when you fall behind or change priorities.",
    cta: "Plan with Athena",
    href: "/dashboard",
    bg: "bg-[var(--color-surface)] border border-[var(--color-border)]",
    textColor: "text-foreground",
    ctaColor: "bg-white/10 text-white hover:bg-white/20",
  },
];

const TESTIMONIALS = [
  { name: "Alex T.", school: "MIT", quote: "Saved my life during finals week. The summaries are genuinely better than my own notes." },
  { name: "Sarah M.", school: "Stanford", quote: "The study plans are actually realistic. Not just a to-do list — it adapts when I fall behind." },
  { name: "Jordan K.", school: "UCLA", quote: "I switched from ChatGPT to Athena and my grades went up. The context memory is a game changer." },
  { name: "Priya R.", school: "Harvard", quote: "Being able to upload a PDF and get key points in seconds is incredible for pre-med." },
];

const UNIVERSITIES = ["MIT", "Stanford", "Harvard", "UCLA", "Berkeley", "Columbia", "Yale", "Princeton"];

export default function LandingPage() {
  const heroRef = useRef<HTMLElement>(null);
  const [activeTab, setActiveTab] = useState(0);
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const handleCtaClick = (e: React.MouseEvent, href: string) => {
    e.preventDefault();
    if (isSignedIn) {
      router.push(href);
    } else {
      router.push("/sign-in");
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!heroRef.current) return;
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      heroRef.current.style.setProperty("--glow-x", `${x}%`);
      heroRef.current.style.setProperty("--glow-y", `${y}%`);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <LandingNav />

      {/* ─── HERO SECTION ─────────────────────────────────── */}
      <section
        ref={heroRef}
        className="relative pt-36 pb-20 px-6 overflow-hidden bg-background"
        style={{
          background: `
            radial-gradient(ellipse 40% 40% at 20% 30%, rgba(168,85,247,0.08), transparent),
            radial-gradient(ellipse 40% 40% at 80% 20%, rgba(232,121,249,0.06), transparent),
            var(--color-background)
          `,
        }}
      >
        <div className="mx-auto max-w-4xl text-center relative z-10">
          <h1 className="text-6xl sm:text-7xl lg:text-[80px] font-extrabold tracking-tight mb-6 leading-[1.05] text-foreground">
            Supercharge your{" "}
            <span className="text-gradient-hero">grades</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted mb-10 max-w-2xl mx-auto leading-relaxed">
            Study, write, and solve faster with the most accurate AI for school.
          </p>
          <button
            onClick={(e) => handleCtaClick(e, "/dashboard")}
            className="inline-block rounded-full bg-white px-10 py-4 text-[16px] font-bold text-black transition-all hover:bg-white/90 hover:scale-[1.02] hover:shadow-xl"
          >
            Use Athena for free
          </button>
        </div>

        {/* Social proof - university logos */}
        <div className="mx-auto max-w-3xl mt-16 text-center">
          <p className="text-[13px] text-muted/60 mb-5 tracking-wide">
            Relied on by 10,000+ students at
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
            {UNIVERSITIES.map((uni) => (
              <span key={uni} className="text-[14px] font-semibold text-muted/40 tracking-wide uppercase">
                {uni}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CATEGORY SWITCHER ────────────────────────────── */}
      <section className="py-20 px-6 bg-background">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground mb-4">
            Other tools guess. <span className="text-gradient">Athena knows.</span>
          </h2>
          <p className="text-muted text-lg mb-10 max-w-xl mx-auto">
            Purpose-built AI agents for every academic task.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {TOOLS.map((tool, i) => (
              <button
                key={tool.label}
                onClick={() => setActiveTab(i)}
                className={`rounded-full px-6 py-2.5 text-[14px] font-medium transition-all ${
                  activeTab === i
                    ? "bg-white text-black shadow-md"
                    : "bg-white/5 text-muted hover:bg-white/10 hover:text-foreground"
                }`}
              >
                {tool.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURE CARDS (Atlas-style) ──────────────────── */}
      <section id="features" className="py-16 px-6 bg-background">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-4 text-center">
            Score higher with powerful tools
          </h2>
          <p className="text-muted text-lg mb-14 max-w-xl mx-auto text-center">
            Three specialized AI agents working together for you.
          </p>

          <div className="grid gap-8">
            {FEATURE_CARDS.map((card, i) => (
              <div
                key={i}
                className={`${card.bg} rounded-[28px] p-10 sm:p-14 flex flex-col sm:flex-row items-start gap-8 transition-transform hover:scale-[1.01]`}
              >
                <div className="flex-1">
                  <h3 className={`text-3xl font-bold mb-3 ${card.textColor}`}>
                    {card.title}
                  </h3>
                  <p className={`text-[16px] leading-relaxed mb-6 text-muted`}>
                    {card.description}
                  </p>
                  <button
                    onClick={(e) => handleCtaClick(e, card.href)}
                    className={`inline-block rounded-full ${card.ctaColor} px-6 py-3 text-[14px] font-semibold transition-all hover:opacity-90 hover:scale-[1.02]`}
                  >
                    {card.cta}
                  </button>
                </div>
                {/* Mock preview */}
                <div className="flex-1 w-full">
                  <div className={`rounded-2xl bg-[#141414] border border-border p-6 h-52 flex flex-col gap-3`}>
                    <div className={`h-4 w-3/5 rounded-full bg-border`} />
                    <div className={`h-4 w-2/5 rounded-full bg-border`} />
                    <div className="flex-1" />
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-full bg-primary/20`} />
                      <div className={`h-8 flex-1 rounded-full bg-border`} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIALS ─────────────────────────────────── */}
      <section className="py-20 px-6 bg-background">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-12 text-center">
            Built for success.
          </h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <div
                key={i}
                className="rounded-2xl surface-card p-8 transition-all hover:shadow-md hover:border-border-light"
              >
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <svg key={j} className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-[15px] text-muted leading-relaxed mb-5 italic">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div>
                  <p className="text-[14px] font-semibold text-foreground">{t.name}</p>
                  <p className="text-[13px] text-muted/60">{t.school}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA (Atlas-style gradient block) ────────── */}
      <section className="py-16 px-6">
        <div className="mx-auto max-w-5xl">
          <div
            className="rounded-[32px] px-10 py-20 sm:py-24 text-center"
            style={{
              background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 40%, #c084fc 70%, #e879f9 100%)",
            }}
          >
            <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-4 tracking-tight">
              Less stress. Better grades.
            </h2>
            <p className="text-lg text-white/70 mb-10 max-w-lg mx-auto">
              Free for students. No credit card required.
            </p>
            <button
              onClick={(e) => handleCtaClick(e, "/dashboard")}
              className="inline-block rounded-full bg-white px-10 py-4 text-[16px] font-bold text-gray-900 transition-all hover:scale-[1.02] hover:shadow-xl"
            >
              Use Athena for free
            </button>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ───────────────────────────────────────── */}
      <footer className="border-t border-border py-12 px-6 bg-background">
        <div className="mx-auto max-w-5xl flex flex-col md:flex-row items-start justify-between gap-10">
          <div className="max-w-xs">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white font-bold text-[9px]">
                A
              </div>
              <span className="font-display text-[15px] font-bold text-foreground">Athena</span>
            </div>
            <p className="text-[13px] text-muted leading-relaxed">
              AI-powered academic assistant built for students who want to study smarter, not harder.
            </p>
          </div>
          <div className="flex gap-16">
            <div>
              <h4 className="text-[12px] font-bold text-foreground uppercase tracking-wider mb-3">Product</h4>
              <div className="space-y-2">
                <Link href="/chat" className="block text-[13px] text-muted hover:text-foreground transition-colors">Chat</Link>
                <Link href="/notes" className="block text-[13px] text-muted hover:text-foreground transition-colors">Notes</Link>
                <Link href="/dashboard" className="block text-[13px] text-muted hover:text-foreground transition-colors">Dashboard</Link>
              </div>
            </div>
            <div>
              <h4 className="text-[12px] font-bold text-foreground uppercase tracking-wider mb-3">Company</h4>
              <div className="space-y-2">
                <Link href="#" className="block text-[13px] text-muted hover:text-foreground transition-colors">Blog</Link>
                <Link href="#" className="block text-[13px] text-muted hover:text-foreground transition-colors">Contact</Link>
                <Link href="#" className="block text-[13px] text-muted hover:text-foreground transition-colors">Privacy</Link>
              </div>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-5xl mt-10 pt-6 border-t border-border">
          <p className="text-[12px] text-muted/60">
            © {new Date().getFullYear()} Athena. Open-source academic assistant.
          </p>
        </div>
      </footer>
    </div>
  );
}
