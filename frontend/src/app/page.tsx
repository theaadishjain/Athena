"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

const FEATURES = [
  {
    title: "Conversational tutoring",
    agent: "Advisor",
    desc: "Ask anything. Athena routes to the right specialist and keeps every exchange in working memory. Context persists for the entire semester.",
  },
  {
    title: "Lecture summaries",
    agent: "Summarizer",
    desc: "Drop a 60-page PDF. Receive a structured summary with key points, definitions, and precise citations in under ten seconds.",
  },
  {
    title: "Adaptive study plans",
    agent: "Planner",
    desc: "Hand Athena your syllabus and an exam date. Receive a realistic plan that adjusts continuously to your pace and retention rate.",
  },
  {
    title: "Spaced-repetition decks",
    agent: "Summarizer",
    desc: "Flashcards generated from your own notes. Reviewed on an SM-2 schedule weighted toward the cards you miss most often.",
  },
];

const TESTIMONIALS = [
  {
    quote: "I went from a 73 on the first midterm to a 91 on the second. The flashcards Athena made from my own lecture notes — not some generic deck — were the difference.",
    name: "Maya Chen", school: "CS · MIT '26", initials: "MC",
  },
  {
    quote: "The Planner noticed I'd forgotten to budget for my orgo lab report. Saved my semester.",
    name: "Jordan Ruiz", school: "Biochem · Stanford '25", initials: "JR",
  },
  {
    quote: "Finally, an AI that doesn't vomit walls of text. It watches what I'm confused about and quizzes me on precisely that.",
    name: "Amelia Park", school: "Math · Berkeley '27", initials: "AP",
  },
];

function AgentBadgeInline({ agent }: { agent: string }) {
  const glyphs: Record<string, React.ReactNode> = {
    Advisor: (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1" />
        <circle cx="5" cy="5" r="1.2" fill="currentColor" />
      </svg>
    ),
    Summarizer: (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <line x1="1" y1="2" x2="9" y2="2" stroke="currentColor" strokeWidth="1" />
        <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1" />
        <line x1="1" y1="8" x2="6" y2="8" stroke="currentColor" strokeWidth="1" />
      </svg>
    ),
    Planner: (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" />
        <line x1="0.5" y1="3.5" x2="9.5" y2="3.5" stroke="currentColor" strokeWidth="1" />
        <line x1="3" y1="0.5" x2="3" y2="3.5" stroke="currentColor" strokeWidth="1" />
      </svg>
    ),
  };
  return (
    <span className="agent-badge">
      <span className="agent-badge-glyph">{glyphs[agent] ?? glyphs.Advisor}</span>
      {agent}
    </span>
  );
}

function CornerTicks() {
  const tick: React.CSSProperties = { position: "absolute", width: 10, height: 10, borderColor: "rgba(237,232,220,0.4)", borderStyle: "solid", borderWidth: 0 };
  return (
    <>
      <span style={{ ...tick, top: 0, left: 0, borderTopWidth: 1, borderLeftWidth: 1 }} />
      <span style={{ ...tick, top: 0, right: 0, borderTopWidth: 1, borderRightWidth: 1 }} />
      <span style={{ ...tick, bottom: 0, left: 0, borderBottomWidth: 1, borderLeftWidth: 1 }} />
      <span style={{ ...tick, bottom: 0, right: 0, borderBottomWidth: 1, borderRightWidth: 1 }} />
    </>
  );
}

function OrbitBackdrop() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      <div className="glow-radial" style={{
        width: 1100, height: 1100,
        top: -350, left: "50%", transform: "translateX(-50%)",
        background: "radial-gradient(circle, rgba(237,232,220,0.09), transparent 65%)",
      }} />
      <div className="glow-radial" style={{
        width: 600, height: 600, top: 200, left: -200,
        background: "radial-gradient(circle, rgba(237,232,220,0.04), transparent 70%)",
      }} />
      <svg width="100%" height="1100" viewBox="0 0 1280 1100"
        style={{ position: "absolute", top: 40, left: 0, opacity: 0.9 }}>
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
        <g style={{ transformOrigin: "640px 420px", animation: "athenaSpin 80s linear infinite" }}>
          <g transform="translate(940, 420)">
            <circle r="5" fill="#ede8dc" />
            <circle r="14" fill="none" stroke="#ede8dc" strokeOpacity="0.25" />
            <text x="22" y="4" fill="#ede8dc" fontSize="9" fontFamily="JetBrains Mono" opacity="0.7" letterSpacing="0.1em">ADVISOR</text>
          </g>
        </g>
        <g style={{ transformOrigin: "640px 420px", animation: "athenaSpin 110s linear infinite reverse" }}>
          <g transform="translate(340, 420)">
            <circle r="4" fill="#ede8dc" opacity="0.85" />
            <rect x="-3" y="-3" width="6" height="6" fill="none" stroke="#ede8dc" strokeOpacity="0.4" />
            <text x="-58" y="4" fill="#ede8dc" fontSize="9" fontFamily="JetBrains Mono" opacity="0.6" letterSpacing="0.1em">PLANNER</text>
          </g>
        </g>
        <g style={{ transformOrigin: "640px 420px", animation: "athenaSpin 160s linear infinite" }}>
          <g transform="translate(840, 640)">
            <circle r="3" fill="#ede8dc" opacity="0.8" />
            <text x="12" y="4" fill="#ede8dc" fontSize="9" fontFamily="JetBrains Mono" opacity="0.55" letterSpacing="0.1em">SUMMARIZER</text>
          </g>
        </g>
        <g style={{ transformOrigin: "640px 420px", animation: "athenaSpin 200s linear infinite reverse" }}>
          <g transform="translate(260, 580)">
            <path d="M0,-4 L4,0 L0,4 L-4,0 Z" fill="#ede8dc" opacity="0.75" />
            <text x="12" y="4" fill="#ede8dc" fontSize="9" fontFamily="JetBrains Mono" opacity="0.5" letterSpacing="0.1em">COORDINATOR</text>
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
  const [navHover, setNavHover] = useState<string | null>(null);
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const handleCta = (href: string) => {
    router.push(isSignedIn ? href : "/sign-in");
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", position: "relative", overflowX: "hidden" }}>

      {/* Sticky Nav */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 20,
        borderBottom: "1px solid rgba(237,232,220,0.08)",
        background: "rgba(10,10,12,0.8)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}>
        <div style={{ padding: "18px 48px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="14.5" stroke="#ede8dc" strokeWidth="1" fill="none" opacity="0.5" />
                <path d="M16 5 L27 16 L16 27 L5 16 Z" stroke="#ede8dc" strokeWidth="1" fill="none" />
                <circle cx="16" cy="16" r="3" fill="#ede8dc" />
                <circle cx="16" cy="16" r="1" fill="#0a0a0c" />
                <line x1="16" y1="1" x2="16" y2="4" stroke="#ede8dc" strokeWidth="1" />
                <line x1="16" y1="28" x2="16" y2="31" stroke="#ede8dc" strokeWidth="1" />
              </svg>
              <span style={{ fontFamily: "var(--font-head)", fontWeight: 400, fontSize: 15, color: "var(--cream)" }}>Athena</span>
            </div>
            <span className="sect-num" style={{ paddingLeft: 36, borderLeft: "1px solid rgba(237,232,220,0.12)" }}>
              MMXXVI — ED. 04
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {["Product", "Agents", "Manifesto", "Pricing"].map((item) => (
              <button key={item}
                onMouseEnter={() => setNavHover(item)}
                onMouseLeave={() => setNavHover(null)}
                style={{
                  padding: "8px 14px", fontSize: 12,
                  color: navHover === item ? "var(--cream)" : "var(--text-muted)",
                  transition: "color .15s",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}>{item}</button>
            ))}
          </div>
          {isSignedIn ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                className="btn btn-primary"
                style={{ fontSize: 12, padding: "10px 18px", fontFamily: "var(--font-mono)", letterSpacing: "0.04em", textTransform: "uppercase" }}
                onClick={() => router.push("/dashboard")}
              >Dashboard →</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                className="btn btn-tertiary"
                style={{ fontSize: 12, fontFamily: "var(--font-mono)", letterSpacing: "0.04em", textTransform: "uppercase" }}
                onClick={() => router.push("/sign-in")}
              >Sign in</button>
              <button
                className="btn btn-primary"
                style={{ fontSize: 12, padding: "10px 18px", fontFamily: "var(--font-mono)", letterSpacing: "0.04em", textTransform: "uppercase" }}
                onClick={() => router.push("/sign-up")}
              >Enroll —</button>
            </div>
          )}
        </div>
      </header>

      {/* Hero */}
      <section style={{ position: "relative", padding: "130px 48px 0", overflow: "hidden" }}>
        <OrbitBackdrop />
        <div style={{ position: "relative", zIndex: 2 }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            borderBottom: "1px solid rgba(237,232,220,0.08)",
            paddingBottom: 14, marginBottom: 48,
          }}>
            <span className="sect-num">§ 01 — OVERTURE</span>
            <span className="sect-num">FOR THE STUDENT WHO INTENDS TO LEARN</span>
            <span className="sect-num">P. 01 / 04</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "start" }}>
            <div className="fade-up">
              <h1 style={{
                fontSize: 116, lineHeight: 0.92,
                fontFamily: "var(--font-head)", fontWeight: 400,
                letterSpacing: "-0.02em",
                color: "var(--cream)",
                margin: 0,
              }}>
                Your<br />
                <em style={{ fontFamily: "var(--font-head)", fontStyle: "italic" }}>quiet</em><br />
                study<br />
                partner.
              </h1>
            </div>

            <div className="fade-up" style={{ animationDelay: "0.1s", paddingTop: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
                <span style={{ width: 8, height: 8, background: "var(--cream)", display: "inline-block", flexShrink: 0 }} />
                <span className="eyebrow" style={{ paddingLeft: 0 }}>
                  <span style={{ color: "var(--cream)" }}>NEW</span> Agent handoff · Spring 2026
                </span>
              </div>
              <p style={{
                fontSize: 22, lineHeight: 1.45,
                color: "var(--cream-dim)", marginBottom: 16,
                maxWidth: 520, letterSpacing: "-0.005em", fontWeight: 300, margin: "0 0 16px",
              }}>
                Athena reads your lecture notes, plans your week, and quizzes you on what you&rsquo;re weak at.
              </p>
              <p style={{
                fontSize: 22, lineHeight: 1.45,
                color: "var(--cream-dim)", marginBottom: 40,
                maxWidth: 520, letterSpacing: "-0.005em", fontWeight: 300, margin: "0 0 40px",
              }}>
                <em style={{ fontFamily: "var(--font-head)", fontStyle: "italic", color: "var(--cream)", fontSize: 24 }}>Four specialists.</em> One focused interface. No noise.
              </p>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <button
                  className="btn btn-primary"
                  onClick={() => isSignedIn ? router.push("/dashboard") : router.push("/sign-up")}
                  style={{ fontSize: 12, padding: "14px 22px", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}
                >Begin — free for students</button>
                <button
                  className="btn btn-ghost"
                  onClick={() => isSignedIn ? router.push("/chat") : router.push("/sign-in")}
                  style={{ fontSize: 12, padding: "14px 18px", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}
                >Demo · Chat</button>
              </div>
              <div style={{ marginTop: 32, display: "grid", gridTemplateColumns: "repeat(3, auto)", gap: 32 }}>
                {[
                  { n: "214K", l: "Study\nsessions" },
                  { n: "48H", l: "Avg. time\nsaved / wk" },
                  { n: "+19%", l: "Median grade\nimprovement" },
                ].map((s, i) => (
                  <div key={i}>
                    <div style={{ fontFamily: "var(--font-head)", fontSize: 44, color: "var(--cream)", lineHeight: 1, letterSpacing: "-0.02em" }}>{s.n}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.1em", whiteSpace: "pre-line", lineHeight: 1.4 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Hero mockup */}
          <div className="fade-up" style={{ animationDelay: "0.3s", marginTop: 90, position: "relative" }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              borderTop: "1px solid rgba(237,232,220,0.08)",
              paddingTop: 16, marginBottom: 20,
            }}>
              <span className="sect-num">FIG. 01 — THE INTERFACE</span>
              <span className="sect-num">↓ WATCH ATHENA THINK</span>
            </div>
            <HeroMockup onCta={() => handleCta("/chat")} />
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: "100px 48px 60px", position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 40 }}>
          <span className="sect-num">§ 03 — THE FOUR AGENTS</span>
          <span className="sect-num">ENTRIES 01 — 04</span>
        </div>
        <h2 style={{
          fontSize: 72, lineHeight: 0.98,
          fontFamily: "var(--font-head)", fontWeight: 400,
          letterSpacing: "-0.02em", color: "var(--cream)",
          marginBottom: 64, maxWidth: 900, margin: "0 0 64px",
        }}>
          One conversation.<br />
          <em style={{ fontFamily: "var(--font-head)", fontStyle: "italic" }}>Four specialists</em> listening<br />
          and handing off.
        </h2>
        <div style={{ borderTop: "1px solid rgba(237,232,220,0.1)" }}>
          {FEATURES.map((f, i) => (
            <FeatureRow key={f.title} feature={f} index={i + 1} onCta={() => handleCta("/chat")} />
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ padding: "80px 48px 40px", position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 40 }}>
          <span className="sect-num">§ 04 — FIELD NOTES</span>
          <span className="sect-num">214,000 SESSIONS · SPRING SEMESTER</span>
        </div>
        <h2 style={{
          fontSize: 52, lineHeight: 1.02,
          fontFamily: "var(--font-head)", fontWeight: 400,
          letterSpacing: "-0.02em", color: "var(--cream)",
          marginBottom: 56, maxWidth: 800, margin: "0 0 56px",
        }}>
          &ldquo;{TESTIMONIALS[0].quote}&rdquo;
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 60 }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            background: "rgba(237,232,220,0.1)", border: "1px solid var(--cream-ghost)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--cream)", fontSize: 14, fontFamily: "var(--font-head)", fontStyle: "italic",
          }}>{TESTIMONIALS[0].initials}</div>
          <div>
            <div style={{ fontSize: 15, color: "var(--cream)", fontFamily: "var(--font-head)", fontStyle: "italic" }}>{TESTIMONIALS[0].name}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.04em", textTransform: "uppercase", marginTop: 2 }}>{TESTIMONIALS[0].school}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", borderTop: "1px solid rgba(237,232,220,0.1)" }}>
          {TESTIMONIALS.slice(1).map((t, i) => (
            <div key={i} style={{
              padding: "32px",
              paddingLeft: i === 0 ? 0 : 32,
              borderRight: i === 0 ? "1px solid rgba(237,232,220,0.1)" : "none",
              borderBottom: "1px solid rgba(237,232,220,0.1)",
            }}>
              <p style={{ fontSize: 20, color: "var(--cream)", lineHeight: 1.4, letterSpacing: "-0.005em", fontFamily: "var(--font-head)", marginBottom: 24, margin: "0 0 24px" }}>
                &ldquo;{t.quote}&rdquo;
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "rgba(237,232,220,0.08)", border: "1px solid var(--cream-ghost)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--cream)", fontSize: 11, fontFamily: "var(--font-head)", fontStyle: "italic",
                }}>{t.initials}</div>
                <div>
                  <div style={{ fontSize: 13, color: "var(--cream)", fontFamily: "var(--font-head)", fontStyle: "italic" }}>{t.name}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{t.school}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "60px 48px 80px", position: "relative", zIndex: 2 }}>
        <div style={{
          padding: "64px 48px",
          border: "1px solid rgba(237,232,220,0.15)",
          position: "relative",
          overflow: "hidden",
        }}>
          <CornerTicks />
          <div className="glow-radial" style={{
            width: 500, height: 500, top: -200, left: "50%", transform: "translateX(-50%)",
            background: "radial-gradient(circle, rgba(237,232,220,0.08), transparent 70%)",
          }} />
          <div style={{ position: "relative", textAlign: "center" }}>
            <span className="sect-num" style={{ marginBottom: 24, display: "block" }}>§ 05 — PROCEED</span>
            <h3 style={{
              fontSize: 56, lineHeight: 1,
              fontFamily: "var(--font-head)", fontWeight: 400,
              color: "var(--cream)", letterSpacing: "-0.02em",
              marginBottom: 16, margin: "0 0 16px",
            }}>Stop re-reading your notes.</h3>
            <p style={{ fontSize: 17, color: "var(--cream-dim)", maxWidth: 460, margin: "0 auto 32px", lineHeight: 1.5 }}>
              Start studying with intention. Free while you&rsquo;re enrolled.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => handleCta("/dashboard")}
              style={{ fontSize: 12, padding: "16px 28px", fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase" }}
            >Begin →</button>
          </div>
        </div>
        <div style={{
          marginTop: 40, paddingTop: 20,
          borderTop: "1px solid rgba(237,232,220,0.08)",
          display: "flex", justifyContent: "space-between",
        }}>
          <span className="sect-num">ATHENA · AMDG · MMXXVI</span>
          <span className="sect-num">SET IN INSTRUMENT SERIF + JETBRAINS MONO</span>
          <span className="sect-num">BUILT FOR ONE PURPOSE</span>
        </div>
      </section>
    </div>
  );
}

function FeatureRow({ feature, index, onCta }: { feature: typeof FEATURES[0]; index: number; onCta: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onCta}
      style={{
        display: "grid",
        gridTemplateColumns: "80px 1fr 360px",
        gap: 32,
        padding: "36px 0",
        borderBottom: "1px solid rgba(237,232,220,0.1)",
        alignItems: "start",
        transition: "background .25s",
        background: hover ? "rgba(237,232,220,0.02)" : "transparent",
        cursor: "pointer",
      }}>
      <div className="sect-num" style={{ paddingTop: 8 }}>No. 0{index}</div>
      <div>
        <div style={{ marginBottom: 14 }}>
          <AgentBadgeInline agent={feature.agent} />
        </div>
        <h3 style={{
          fontSize: 42, lineHeight: 1,
          fontFamily: "var(--font-head)", fontWeight: 400,
          color: "var(--cream)", letterSpacing: "-0.02em", margin: 0,
        }}>{feature.title}</h3>
      </div>
      <p style={{ fontSize: 15, color: "var(--cream-dim)", lineHeight: 1.55, letterSpacing: "-0.005em", paddingTop: 6, fontWeight: 300, margin: 0 }}>
        {feature.desc}
      </p>
    </div>
  );
}

function HeroMockup({ onCta }: { onCta: () => void }) {
  return (
    <div style={{
      border: "1px solid rgba(237,232,220,0.15)",
      background: "#0f0f12",
      overflow: "hidden",
      position: "relative",
    }}>
      <CornerTicks />
      <div style={{
        padding: "10px 16px",
        borderBottom: "1px solid rgba(237,232,220,0.08)",
        display: "flex", alignItems: "center", gap: 12,
        background: "rgba(237,232,220,0.015)",
      }}>
        <div style={{ display: "flex", gap: 5 }}>
          {[0,1,2].map(i => <span key={i} style={{ width: 9, height: 9, borderRadius: "50%", border: "1px solid rgba(237,232,220,0.15)" }} />)}
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-muted)", marginLeft: 12, letterSpacing: "0.04em" }}>
          athena.app · linear-algebra-final · 14:32
        </span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.06em" }}>LIVE</span>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--cream)", animation: "athenaPulse 2s infinite" }} />
      </div>
      <div style={{ display: "flex", height: 520 }}>
        <div style={{ width: 210, borderRight: "1px solid rgba(237,232,220,0.08)", padding: "16px 12px" }}>
          <div style={{ padding: "4px 8px 16px" }}>
            <span style={{ fontFamily: "var(--font-head)", fontSize: 14, color: "var(--cream)", fontStyle: "italic" }}>Athena</span>
          </div>
          <div className="sect-num" style={{ padding: "10px 10px 6px", fontSize: 9 }}>Recent</div>
          {["Linear algebra final", "Neural nets · ch. 3", "OrgChem mechanisms", "Macroecon PS #5"].map((s, i) => (
            <div key={s} style={{
              padding: "7px 10px", fontSize: 12,
              background: i === 0 ? "rgba(237,232,220,0.06)" : "transparent",
              color: i === 0 ? "var(--cream)" : "var(--text-muted)",
              marginBottom: 1,
              borderLeft: i === 0 ? "1.5px solid var(--cream)" : "1.5px solid transparent",
              fontWeight: i === 0 ? 500 : 400,
            }}>{s}</div>
          ))}
        </div>
        <div style={{ flex: 1, padding: 28, overflow: "hidden", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ alignSelf: "flex-end", maxWidth: "72%" }}>
            <div style={{ background: "var(--cream)", color: "#0a0a0c", padding: "11px 16px", fontSize: 13.5, lineHeight: 1.5 }}>
              Can you help me understand eigenvectors? Midterm Wednesday, I&rsquo;m stuck.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, border: "1px solid var(--cream-ghost)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--cream)", fontSize: 15, fontFamily: "var(--font-head)", fontStyle: "italic" }}>A</div>
            <AgentBadgeInline agent="Coordinator" />
            <span style={{ color: "var(--text-dim)", fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>→ ROUTED</span>
            <AgentBadgeInline agent="Planner" />
          </div>
          <div style={{
            background: "rgba(237,232,220,0.02)", border: "1px solid rgba(237,232,220,0.08)",
            padding: "14px 16px", fontSize: 13.5, lineHeight: 1.55,
            color: "var(--cream)", maxWidth: "80%",
            fontFamily: "var(--font-head)", letterSpacing: "0.005em",
          }}>
            Let&rsquo;s build a 3-day plan. An eigenvector <code style={{ fontFamily: "var(--font-mono)", background: "rgba(237,232,220,0.08)", padding: "1px 6px", color: "var(--cream)", fontSize: 11.5, border: "none" }}>v</code> of matrix <code style={{ fontFamily: "var(--font-mono)", background: "rgba(237,232,220,0.08)", padding: "1px 6px", color: "var(--cream)", fontSize: 11.5, border: "none" }}>A</code> satisfies <code style={{ fontFamily: "var(--font-mono)", color: "var(--cream)", fontSize: 11.5, border: "none" }}>Av = λv</code>.
          </div>
          <div style={{ border: "1px solid rgba(237,232,220,0.1)", padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid rgba(237,232,220,0.08)" }}>
              <span className="sect-num">PLAN · 03 SESSIONS</span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>BY PLANNER</span>
            </div>
            {[
              { day: "MON", task: "Eigenvalue intuition", time: "45m" },
              { day: "TUE", task: "Diagonalization practice", time: "60m" },
              { day: "WED", task: "Mock midterm", time: "90m" },
            ].map((p, i) => (
              <div key={p.day} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "7px 0",
                borderBottom: i < 2 ? "1px dashed rgba(237,232,220,0.06)" : "none",
                fontSize: 12,
              }}>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--cream)", width: 36, fontSize: 10, letterSpacing: "0.06em" }}>{p.day}</span>
                <span style={{ color: "var(--cream)", flex: 1, fontFamily: "var(--font-head)", fontSize: 14 }}>{p.task}</span>
                <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>{p.time}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "auto" }}>
            <div
              onClick={onCta}
              style={{
                border: "1px solid rgba(237,232,220,0.15)", padding: "12px 16px",
                display: "flex", alignItems: "center", gap: 12,
                color: "var(--text-dim)", fontSize: 13,
                fontFamily: "var(--font-head)", fontStyle: "italic",
                cursor: "pointer",
              }}>
              <span>Ask Athena anything…</span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                <span className="kbd" style={{ fontSize: 10 }}>/</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-dim)", fontStyle: "normal", letterSpacing: "0.04em" }}>CMDS</span>
              </span>
              <div style={{ width: 28, height: 28, background: "var(--cream)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0a0a0c" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0a0a0c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
