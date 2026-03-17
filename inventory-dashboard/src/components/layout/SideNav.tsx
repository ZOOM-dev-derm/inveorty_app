import { NavLink } from "react-router-dom";
import { BarChart3, ShoppingCart, Settings, X } from "lucide-react";

interface SideNavProps {
  open: boolean;
  onClose: () => void;
}

const links = [
  { to: "/products", label: "מוצרים", icon: BarChart3 },
  { to: "/orders", label: "הזמנות", icon: ShoppingCart },
  { to: "/settings", label: "הגדרות", icon: Settings },
];

export function SideNav({ open, onClose }: SideNavProps) {
  return (
    <>
      {/* Overlay */}
      <div
        className={`drawer-overlay ${open ? "drawer-overlay-visible" : ""}`}
        onClick={onClose}
      />
      {/* Panel */}
      <nav
        className={`drawer-panel ${open ? "drawer-panel-open" : ""}`}
      >
        <div className="flex items-center justify-between p-4 border-b border-border/40">
          <h2 className="font-bold text-base">ניווט</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-3 space-y-1">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
