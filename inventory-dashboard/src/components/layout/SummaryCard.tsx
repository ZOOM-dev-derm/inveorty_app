import type { ReactNode } from "react";

interface SummaryCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  variant?: "blue" | "purple" | "rose" | "amber";
}

const variants = {
  blue: "bg-blue-50/70 border-blue-100/60 text-blue-700",
  purple: "bg-purple-50/70 border-purple-100/60 text-purple-700",
  rose: "bg-rose-50/70 border-rose-100/60 text-rose-700",
  amber: "bg-amber-50/70 border-amber-100/60 text-amber-700",
};

const valueVariants = {
  blue: "text-blue-900",
  purple: "text-purple-900",
  rose: "text-rose-900",
  amber: "text-amber-900",
};

export function SummaryCard({ label, value, icon, variant = "blue" }: SummaryCardProps) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${variants[variant]}`}>
      <div className="shrink-0 opacity-70">{icon}</div>
      <div>
        <div className="text-xs font-medium">{label}</div>
        <div className={`text-lg font-bold ${valueVariants[variant]}`}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
      </div>
    </div>
  );
}
