"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import AgentBadge from "@/components/ui/AgentBadge";
import CornerTicks from "@/components/ui/CornerTicks";
import Logo from "@/components/ui/Logo";

const FEATURES = [
  {
    title: "Conversational tutoring",
    agent: "Advisor",
    desc: "Ask anything. Athena routes each request to the right specialist, follows the thread of your chat, and keeps a long-term memory of your topics, preferences and weak areas.",
  },
  {
    title: "Lecture summaries",
    agent: "Summarizer",
    desc: "Drop a 60-page PDF. Athena reads every page and streams back a structured summary — key points, definitions and a page citation for each — in seconds.",
  },
  {
    title: "Weak-spot study plans",
    agent: "Planner",
    desc: "Hand Athena your syllabus and an exam. Get a day-by-day plan that follows the syllabus and gives extra time to the weak areas your quizzes and notes reveal.",
  },
  {
    title: "Spaced-repetition decks",
    agent: "Flashcard",
    desc: "Flashcards from your own notes, each citing its page. Mark each one Got it or Missed it, and an SM-2 schedule brings back the cards you miss sooner.",
  },
  {
    title: "Weak-spot quizzes",
    agent: "Quiz",
    desc: "Five scored questions at a time. Every miss is saved as a weak area, and your next quiz — and your study plan — aims straight at it.",
  },
];

// Real example prompts and the agent that handles each one. (Replace with
// genuine, attributed user feedback once you have it.)
const EXAMPLES = [
  {
    prompt: "I have a data structures exam in 3 days. Help me plan.",
    agent: "Planner", result: "Day-by-day schedule, saved to your notes", initials: "P",
  },
  {
    prompt: "Create 20 flashcards on binary trees.",
    agent: "Flashcards", result: "20 flip cards you can review in chat", initials: "F",
  },
  {
    prompt: "Quiz me on photosynthesis.",
    agent: "Quiz", result: "5 multiple-choice questions, scored instantly", initials: "Q",
  },
];

function OrbitBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="glow-radial" style={{
        width: 1100, height: 1100,
        top: -350, left: "50%", transform: "translateX(-50%)",
        background: "radial-gradient(circle, rgba(237,232,220,0.09), transparent 65%)",
      }} />
      <div className="glow-radial" style={{
        width: 600, height: 600, top: 200, left: -200,
        background: "radial-gradient(circle, rgba(237,232,220,0.04), transparent 70%)",
      }} />
      <svg width="100%" height="1100" viewBox="0 0 1280 1100" className="absolute top-10 left-0 opacity-90">
        <defs>
          <radialGradient id="orbitCore" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#ede8dc" stopOpacity="0.18" />
            <stop offset="60%" stopColor="#ede8dc" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#ede8dc" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="640" cy="420" r="360" fill="url(#orbitCore)" />
        <circle cx="640" cy="420" r="3" fill="#ede8dc" />
        <circle cx="640" cy="420" r="1" fill="#0a0a0c" />
        <g style={{ transformOrigin: "640px 420px", animation: "athenaSpin 120s linear infinite" }}>
          {[
            { rx: 280, ry: 84, rot: 0 },
            { rx: 380, ry: 120, rot: -8 },
            { rx: 500, ry: 170, rot: 6, dashed: true },
            { rx: 640, ry: 220, rot: -14 },
            { rx: 800, ry: 270, rot: 10 },
          ].map((o, i) => (
            <ellipse key={i} cx="640" cy="420" rx={o.rx} ry={o.ry}
              fill="none" stroke="#ede8dc"
              strokeOpacity={0.07 + i * 0.015}
              strokeWidth="0.8"
              transform={`rotate(${o.rot} 640 420)`}
              strokeDasharray={o.dashed ? "2 6" : undefined} />
          ))}
        </g>
        <g fontFamily="Figtree, sans-serif" fontSize="10" fontWeight="600" letterSpacing="0.1em" fill="#ede8dc">
          <g style={{ transformOrigin: "640px 420px", animation: "athenaSpin 80s linear infinite" }}>
            <g transform="translate(940, 420)">
              <circle r="5" />
              <circle r="14" fill="none" stroke="#ede8dc" strokeOpacity="0.25" />
            </g>
          </g>
          <g style={{ transformOrigin: "640px 420px", animation: "athenaSpin 110s linear infinite reverse" }}>
            <g transform="translate(340, 420)">
              <circle r="4" opacity="0.85" />
              <rect x="-3" y="-3" width="6" height="6" fill="none" stroke="#ede8dc" strokeOpacity="0.4" />
            </g>
          </g>
          <g style={{ transformOrigin: "640px 420px", animation: "athenaSpin 160s linear infinite" }}>
            <g transform="translate(840, 640)">
              <circle r="3" opacity="0.8" />
            </g>
          </g>
          <g style={{ transformOrigin: "640px 420px", animation: "athenaSpin 200s linear infinite reverse" }}>
            <g transform="translate(260, 580)">
              <path d="M0,-4 L4,0 L0,4 L-4,0 Z" opacity="0.75" />
            </g>
          </g>
        </g>
        {[[120, 180], [1140, 240], [1200, 520], [90, 520], [1180, 780], [80, 760], [560, 920], [800, 920]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="1" fill="#ede8dc" opacity={0.15 + (i % 3) * 0.15} />
        ))}
      </svg>
    </div>
  );
}

export default function LandingPage() {
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const handleCta = (href: string) => {
    router.push(isSignedIn ? href : "/sign-in");
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">

      {/* Sticky Nav */}
      <header
        className="fixed top-0 right-0 left-0 z-20 border-b border-line"
        style={{ background: "rgba(10,10,12,0.8)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
      >
        <div className="mx-auto w-full max-w-[1416px] flex items-center justify-between px-12 py-[18px]">
          <Logo />
          {isSignedIn ? (
            <button className="btn btn-primary btn-sm px-[18px] py-2.5" onClick={() => router.push("/dashboard")}>
              Dashboard →
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button className="btn btn-tertiary btn-sm" onClick={() => router.push("/sign-in")}>Sign in</button>
              <button className="btn btn-primary btn-sm px-[18px] py-2.5" onClick={() => router.push("/sign-up")}>
                Enroll —
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Hero */}
      <section id="product" className="mx-auto w-full max-w-[1416px] relative scroll-mt-20 overflow-hidden px-12 pt-[112px]">
        <OrbitBackdrop />
        <div className="relative z-[2]">
          <div className="running-head mb-10 pb-3.5">
            <span className="label">§ 01 — Overture</span>
            <span className="label">For the student who intends to learn</span>
            <span className="label">P. 01 / 04</span>
          </div>

          <div className="grid grid-cols-[1.05fr_1fr] items-center gap-16">
            <div className="fade-up">
              <h1 className="h-hero">
                Your<br />
                <em className="serif-i">quiet</em><br />
                study<br />
                partner.
              </h1>
            </div>

            <div className="fade-up pt-6" style={{ animationDelay: "0.1s" }}>
              <div className="mb-7 flex items-center gap-3">
                <span className="inline-block h-2 w-2 shrink-0 bg-cream" />
                <span className="eyebrow">
                  <span className="text-cream">New</span> Spaced repetition · Spring 2026
                </span>
              </div>
              <p className="text-lead mb-4 max-w-[520px] text-[21px]">
                Athena reads your lecture notes, plans your week, and quizzes you on what you&rsquo;re weak at.
              </p>
              <p className="text-lead mb-10 max-w-[520px] text-[21px]">
                <em className="serif-i text-[24px]">Five specialists.</em> One focused interface. No noise.
              </p>
              <div className="flex items-center gap-3">
                <button
                  className="btn btn-primary btn-lg"
                  onClick={() => isSignedIn ? router.push("/dashboard") : router.push("/sign-up")}
                >
                  Begin — free for students
                </button>
                <button
                  className="btn btn-ghost btn-lg"
                  onClick={() => isSignedIn ? router.push("/chat") : router.push("/sign-in")}
                >
                  Demo · Chat
                </button>
              </div>
              <div className="mt-8 grid grid-cols-[repeat(3,auto)] gap-8">
                {[
                  { n: "5", l: "Specialist\nagents" },
                  { n: "10–30", l: "Cards per\nflashcard deck" },
                  { n: "5", l: "Scored MCQs\nper quiz" },
                ].map((s, i) => (
                  <div key={i}>
                    <div className="serif text-[44px] leading-none tracking-[-0.02em]">{s.n}</div>
                    <div className="label mt-1.5 whitespace-pre-line">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Hero mockup */}
          <div className="fade-up relative mx-auto mt-[72px] max-w-[1180px]" style={{ animationDelay: "0.3s" }}>
            <div className="mb-5 flex items-baseline justify-between border-t border-line pt-4">
              <span className="label">Fig. 01 — The interface</span>
              <span className="label">↓ Watch Athena think</span>
            </div>
            <HeroMockup onCta={() => handleCta("/chat")} />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="agents" className="mx-auto w-full max-w-[1416px] relative z-[2] scroll-mt-20 px-12 pt-[100px] pb-[60px]">
        <div className="mb-10 flex items-baseline justify-between">
          <span className="label">§ 03 — The five agents</span>
          <span className="label">Entries 01 — 05</span>
        </div>
        <h2 className="h-xl mb-16 max-w-[900px] text-[72px] leading-[0.98]">
          One conversation.<br />
          <em className="serif-i">Five specialists,</em> and a router<br />
          that picks the right one.
        </h2>
        <div className="border-t" style={{ borderColor: "rgba(237,232,220,0.1)" }}>
          {FEATURES.map((f, i) => (
            <div key={f.title} className="feature-row" onClick={() => handleCta("/chat")}>
              <div className="label pt-2">No. 0{i + 1}</div>
              <div>
                <div className="mb-3.5"><AgentBadge agent={f.agent} /></div>
                <h3 className="h-md leading-none">{f.title}</h3>
              </div>
              <p className="text-body m-0 pt-1.5">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Example prompts */}
      <section id="examples" className="mx-auto w-full max-w-[1416px] relative z-[2] scroll-mt-20 px-12 pt-20 pb-10">
        <div className="mb-10 flex items-baseline justify-between">
          <span className="label">§ 04 — Try saying</span>
          <span className="label">Routed automatically</span>
        </div>
        <h2 className="h-lg mb-14 max-w-[800px]">
          &ldquo;{EXAMPLES[0].prompt}&rdquo;
        </h2>
        <div className="mb-[60px] flex items-center gap-3.5">
          <div className="avatar avatar-round h-11 w-11 text-[15px]">{EXAMPLES[0].initials}</div>
          <div>
            <div className="serif-i text-[16px]">{EXAMPLES[0].agent} agent</div>
            <div className="text-meta mt-0.5">{EXAMPLES[0].result}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t" style={{ borderColor: "rgba(237,232,220,0.1)" }}>
          {EXAMPLES.slice(1).map((t, i) => (
            <div
              key={i}
              className={`border-b p-8 ${i === 0 ? "border-r pl-0" : ""}`}
              style={{ borderColor: "rgba(237,232,220,0.1)" }}
            >
              <p className="serif mb-6 text-[21px] leading-[1.4]">&ldquo;{t.prompt}&rdquo;</p>
              <div className="flex items-center gap-2.5">
                <div className="avatar avatar-round h-8 w-8 text-[12px]">{t.initials}</div>
                <div>
                  <div className="serif-i text-[14px]">{t.agent} agent</div>
                  <div className="text-meta">{t.result}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-[1416px] relative z-[2] px-12 pt-[60px] pb-20">
        <div className="relative overflow-hidden border px-12 py-16" style={{ borderColor: "rgba(237,232,220,0.15)" }}>
          <CornerTicks size={10} />
          <div className="glow-radial" style={{
            width: 500, height: 500, top: -200, left: "50%", transform: "translateX(-50%)",
            background: "radial-gradient(circle, rgba(237,232,220,0.08), transparent 70%)",
          }} />
          <div className="relative text-center">
            <span className="label mb-6 block">§ 05 — Proceed</span>
            <h3 className="h-lg mb-4 text-[56px] leading-none">Stop re-reading your notes.</h3>
            <p className="text-lead mx-auto mb-8 max-w-[460px] text-[17px]">
              Start studying with intention. Free to use.
            </p>
            <button className="btn btn-primary btn-lg" onClick={() => handleCta("/dashboard")}>Begin →</button>
          </div>
        </div>
        <div className="mt-10 flex justify-between border-t border-line pt-5">
          <span className="label">Athena · AMDG · MMXXVI</span>
          <span className="label">Set in Fraunces + Figtree</span>
          <span className="label">Built for one purpose</span>
        </div>
      </section>
    </div>
  );
}

function HeroMockup({ onCta }: { onCta: () => void }) {
  return (
    <div className="relative overflow-hidden border" style={{ borderColor: "rgba(237,232,220,0.15)", background: "#0f0f12" }}>
      <CornerTicks size={10} />
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5" style={{ background: "rgba(237,232,220,0.015)" }}>
        <div className="flex gap-[5px]">
          {[0, 1, 2].map(i => <span key={i} className="h-[9px] w-[9px] rounded-full border" style={{ borderColor: "rgba(237,232,220,0.15)" }} />)}
        </div>
        <span className="text-meta ml-3">athena.app · linear-algebra-final · 14:32</span>
        <span className="label ml-auto">Live</span>
        <span className="pulse-dot h-1.5 w-1.5" style={{ animationDuration: "2s" }} />
      </div>
      <div className="flex h-[480px]">
        <div className="w-[210px] border-r border-line px-3 py-4">
          <div className="px-2 pt-1 pb-4"><span className="serif-i text-[15px]">Athena</span></div>
          <div className="label px-2.5 pt-2.5 pb-1.5 text-[10px]">Recent</div>
          {["Linear algebra final", "Neural nets · ch. 3", "OrgChem mechanisms", "Macroecon PS #5"].map((s, i) => (
            <div key={s} className={`nav-item mb-px py-[7px] text-[13px] ${i === 0 ? "is-active" : ""}`}>{s}</div>
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-[18px] overflow-hidden p-7">
          <div className="max-w-[72%] self-end">
            <div className="bubble-user max-w-none text-[14px]">
              Can you help me understand eigenvectors? Midterm Wednesday, I&rsquo;m stuck.
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="avatar h-[30px] w-[30px] text-[15px]">A</div>
            <AgentBadge agent="Coordinator" />
            <span className="label text-dim">→ Routed</span>
            <AgentBadge agent="Planner" />
          </div>
          <div className="max-w-[80%] border border-line px-4 py-3.5 text-[14px] leading-[1.6] text-cream" style={{ background: "rgba(237,232,220,0.02)" }}>
            Let&rsquo;s build a 3-day plan. An eigenvector{" "}
            <code className="px-1.5 py-px font-mono text-[12px]" style={{ background: "rgba(237,232,220,0.08)" }}>v</code> of matrix{" "}
            <code className="px-1.5 py-px font-mono text-[12px]" style={{ background: "rgba(237,232,220,0.08)" }}>A</code> satisfies{" "}
            <code className="font-mono text-[12px]">Av = λv</code>.
          </div>
          <div className="border p-4" style={{ borderColor: "rgba(237,232,220,0.1)" }}>
            <div className="mb-3 flex items-center gap-2.5 border-b border-line pb-2.5">
              <span className="label">Plan · 03 sessions</span>
              <span className="label ml-auto text-dim">By Planner</span>
            </div>
            {[
              { day: "MON", task: "Eigenvalue intuition", time: "45m" },
              { day: "TUE", task: "Diagonalization practice", time: "60m" },
              { day: "WED", task: "Mock midterm", time: "90m" },
            ].map((p, i) => (
              <div
                key={p.day}
                className="flex items-center gap-3.5 py-[7px]"
                style={{ borderBottom: i < 2 ? "1px dashed rgba(237,232,220,0.06)" : "none" }}
              >
                <span className="label label-strong w-10">{p.day}</span>
                <span className="flex-1 text-[14.5px] text-cream">{p.task}</span>
                <span className="text-meta">{p.time}</span>
              </div>
            ))}
          </div>
          <div className="mt-auto">
            <div
              onClick={onCta}
              className="flex cursor-pointer items-center gap-3 border px-4 py-3 text-[14px] text-dim"
              style={{ borderColor: "rgba(237,232,220,0.15)" }}
            >
              <span>Ask Athena anything…</span>
              <span className="ml-auto flex items-center gap-1.5">
                <span className="kbd">/</span>
                <span className="label text-dim">Cmds</span>
              </span>
              <div className="flex h-7 w-7 items-center justify-center bg-cream text-ink">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
