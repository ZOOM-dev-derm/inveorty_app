import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { StockJumpAlert } from "@/components/StockJumpAlert";

export function Layout() {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header />
      <main className="max-w-[1400px] mx-auto px-4 md:px-8 py-6">
        <Outlet />
      </main>
      <footer className="text-center text-xs text-muted-foreground py-4 border-t border-border/30">
        הנתונים מתעדכנים כל 5 דקות
      </footer>
      <StockJumpAlert />
    </div>
  );
}
