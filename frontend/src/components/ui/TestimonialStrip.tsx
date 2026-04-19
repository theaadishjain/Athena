"use client";

const QUOTES = [
  { text: "Athena helped me ace my finals — the AI study plans are unreal.", who: "Priya S.", dept: "CS, 3rd Year" },
  { text: "I summarize all my lecture PDFs in seconds. Total game changer.", who: "James L.", dept: "Biology, 2nd Year" },
  { text: "The memory feature actually remembers my weak areas. Feels personal.", who: "Sarah K.", dept: "Math, 4th Year" },
  { text: "Best study tool I've used. Simple, fast, and genuinely smart.", who: "Alex M.", dept: "Physics, 1st Year" },
  { text: "Went from C's to A's after one semester. Not exaggerating.", who: "Maria G.", dept: "Chemistry, 2nd Year" },
  { text: "The chat understands context like no other tool I've tried.", who: "David R.", dept: "Engineering, 3rd Year" },
];

export default function TestimonialStrip() {
  const doubled = [...QUOTES, ...QUOTES];

  return (
    <section className="py-20 overflow-hidden" id="testimonials">
      <div className="mb-10 px-6">
        <div className="mx-auto max-w-4xl flex items-center gap-3">
          <div className="h-px flex-1 max-w-[60px] bg-border-light" />
          <span className="text-[11px] font-medium text-muted uppercase tracking-[0.2em]">
            From real students
          </span>
        </div>
      </div>

      <div className="relative">
        {/* Fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

        <div className="flex gap-4 animate-marquee" style={{ width: "max-content" }}>
          {doubled.map((q, i) => (
            <div
              key={`${q.who}-${i}`}
              className="shrink-0 w-[320px] rounded-xl border border-border bg-surface p-5"
            >
              <p className="text-[13px] text-foreground/70 leading-relaxed mb-4">
                &ldquo;{q.text}&rdquo;
              </p>
              <div className="flex items-center gap-2.5">
                <div className="h-6 w-6 rounded-full bg-primary/8 flex items-center justify-center text-[10px] font-semibold text-primary">
                  {q.who.charAt(0)}
                </div>
                <div>
                  <p className="text-[12px] font-medium text-foreground/80">{q.who}</p>
                  <p className="text-[10px] text-muted">{q.dept}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
