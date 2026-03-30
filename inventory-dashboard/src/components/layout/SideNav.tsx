import { NavLink } from "react-router-dom";
import { MaterialIcon } from "@/components/ui/MaterialIcon";
import logoSrc from "@/assets/logo.png";

interface SideNavProps {
  open: boolean;
  onClose: () => void;
}

const links = [
  { to: "/products", label: "ניהול מוצרים", icon: "inventory_2" },
  { to: "/orders", label: "רכש", icon: "shopping_cart" },
  { to: "/supplier-messages", label: "הודעות ספק", icon: "mail" },
  { to: "/settings", label: "הגדרות", icon: "settings" },
];

export function SideNav({ open, onClose }: SideNavProps) {
  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`drawer-overlay lg:hidden ${open ? "drawer-overlay-visible" : ""}`}
        onClick={onClose}
      />

      {/* Sidebar — permanent on desktop, drawer on mobile */}
      <nav
        className={`
          fixed top-0 right-0 bottom-0 z-50
          w-64 bg-sidebar border-l border-border
          flex flex-col
          transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
          lg:translate-x-0
          ${open ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {/* Logo */}
        <div className="px-6 pt-8 pb-6">
          <img src={logoSrc} alt="Dermalosophy" className="h-10 w-auto mb-1" />
          <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-display font-bold">
            ניהול קליני
          </p>
        </div>

        {/* Nav links */}
        <div className="flex-1 px-3 space-y-1">
          {links.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all ${
                  isActive
                    ? "bg-primary/10 text-primary font-bold"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }`
              }
            >
              <span className="text-xl leading-none">
                <MaterialIcon name={icon} />
              </span>
              {label}
            </NavLink>
          ))}
        </div>

        {/* Footer info */}
        <div className="px-6 py-4 text-[10px] text-muted-foreground/60">
          הנתונים מתעדכנים כל 5 דקות
        </div>
      </nav>
    </>
  );
}
