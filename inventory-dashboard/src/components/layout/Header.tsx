import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Menu, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddProductDialog } from "@/components/AddProductDialog";
import { AddOrderDialog } from "@/components/AddOrderDialog";
import { useSyncMissingProducts, useSyncSupplierSkus } from "@/hooks/useSheetData";
import { useAuth } from "@/contexts/AuthContext";
import { SideNav } from "./SideNav";
import logoSrc from "@/assets/logo.png";

export function Header() {
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const syncMutation = useSyncMissingProducts();
  const syncSkusMutation = useSyncSupplierSkus();
  const { user, logout } = useAuth();

  const handleRefresh = async () => {
    setRefreshing(true);
    await client.invalidateQueries();
    setRefreshing(false);
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          {/* Right: hamburger */}
          <div className="flex items-center">
            <button
              onClick={() => setNavOpen(true)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label="פתח תפריט"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>

          {/* Center: Logo */}
          <div className="absolute left-1/2 -translate-x-1/2">
            <img src={logoSrc} alt="Dermalosophy" className="h-12 w-auto" />
          </div>

          {/* Left: Actions */}
          <div className="flex items-center gap-1.5">
            <AddProductDialog />
            <AddOrderDialog />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { syncMutation.mutate(); syncSkusMutation.mutate(); }}
              disabled={syncMutation.isPending || syncSkusMutation.isPending}
              title="סנכרן מוצרים + מק״טי פאר פארם"
              className="h-8 w-8 hidden sm:inline-flex"
            >
              {(syncMutation.isPending || syncSkusMutation.isPending) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
              title="רענן נתונים"
              className="h-8 w-8"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            {user && (
              <Button
                variant="ghost"
                size="icon"
                onClick={logout}
                title={`התנתק (${user.email})`}
                className="h-8 w-8"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <SideNav open={navOpen} onClose={() => setNavOpen(false)} />
    </>
  );
}
