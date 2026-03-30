import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { SideNav } from "./SideNav";
import { StockJumpAlert } from "@/components/StockJumpAlert";

export function Layout() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Desktop sidebar */}
      <SideNav open={navOpen} onClose={() => setNavOpen(false)} />

      {/* Main content area — offset for sidebar on desktop */}
      <div className="lg:mr-64">
        <Header onMenuClick={() => setNavOpen(true)} />
        <main className="px-4 md:px-8 py-6 max-w-7xl">
          <Outlet />
        </main>
      </div>

      <StockJumpAlert />
    </div>
  );
}
