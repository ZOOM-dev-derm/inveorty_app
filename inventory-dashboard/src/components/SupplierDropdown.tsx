import { useRef, useEffect, useState } from "react";
import { MaterialIcon } from "@/components/ui/MaterialIcon";

interface SupplierDropdownProps {
  suppliers: string[];
  value: string;
  onChange: (supplier: string) => void;
}

export function SupplierDropdown({ suppliers, value, onChange }: SupplierDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 h-10 px-3 rounded-lg border text-sm font-medium transition-all whitespace-nowrap
          ${value
            ? "border-primary/40 bg-primary/5 text-foreground"
            : "border-input bg-background text-muted-foreground hover:text-foreground"
          } focus:outline-none focus:ring-2 focus:ring-primary/20`}
      >
        <span>{value || "ספק"}</span>
        {value ? (
          <span
            className="text-sm hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onChange(""); setOpen(false); }}
          >
            <MaterialIcon name="close" />
          </span>
        ) : (
          <span className="text-sm"><MaterialIcon name="expand_more" /></span>
        )}
      </button>
      {open && suppliers.length > 0 && (
        <div className="absolute top-full mt-1 right-0 z-50 min-w-[180px] max-h-64 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
          {suppliers.map((supplier) => (
            <button
              key={supplier}
              onClick={() => { onChange(supplier); setOpen(false); }}
              className={`w-full text-right px-3 py-2 text-sm hover:bg-white/5 transition-colors
                ${value === supplier ? "bg-primary/10 font-semibold" : ""}`}
            >
              {supplier}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
