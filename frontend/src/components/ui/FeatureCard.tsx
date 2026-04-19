"use client";

interface FeatureCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  index: number;
}

export default function FeatureCard({
  title,
  description,
  icon,
  index,
}: FeatureCardProps) {
  return (
    <div
      className="surface-card p-8 animate-fade-in-up"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="mb-5 h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted leading-relaxed">{description}</p>
    </div>
  );
}
