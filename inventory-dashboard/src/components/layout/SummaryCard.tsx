import type { ReactNode } from "react";

interface SummaryCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  variant?: "blue" | "purple" | "rose" | "amber";
}

const iconBg = {
  blue: "bg-blue-500/20",
  purple: "bg-purple-500/20",
  rose: "bg-rose-500/20",
  amber: "bg-amber-500/20",
};

const iconColor = {
  blue: "text-blue-400",
  purple: "text-purple-400",
  rose: "text-rose-400",
  amber: "text-amber-400",
};

export function SummaryCard({ label, value, icon, variant = "blue" }: SummaryCardProps) {
  return (
    <div className="flex items-center gap-4 px-5 py-4 rounded-2xl border border-border bg-card">
      <div className={`shrink-0 p-3 rounded-xl ${iconBg[variant]} ${iconColor[variant]}`}>
        {icon}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold font-display text-foreground">
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
      </div>
    </div>
  );
}
