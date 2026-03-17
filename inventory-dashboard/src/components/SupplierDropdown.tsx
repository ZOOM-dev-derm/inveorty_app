import { useRef, useEffect, useState } from "react";
import { ChevronDown, X } from "lucide-react";

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
          <X
            className="h-3.5 w-3.5 hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onChange(""); setOpen(false); }}
          />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>
      {open && suppliers.length > 0 && (
        <div className="absolute top-full mt-1 right-0 z-50 min-w-[180px] max-h-64 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
          {suppliers.map((supplier) => (
            <button
              key={supplier}
              onClick={() => { onChange(supplier); setOpen(false); }}
              className={`w-full text-right px-3 py-2 text-sm hover:bg-muted/50 transition-colors
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
