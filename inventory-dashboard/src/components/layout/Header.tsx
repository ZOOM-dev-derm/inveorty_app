import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MaterialIcon } from "@/components/ui/MaterialIcon";
import { AddProductDialog } from "@/components/AddProductDialog";
import { AddOrderDialog } from "@/components/AddOrderDialog";
import { useSyncMissingProducts, useSyncSupplierSkus } from "@/hooks/useSheetData";
import { useAuth } from "@/contexts/AuthContext";

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const syncMutation = useSyncMissingProducts();
  const syncSkusMutation = useSyncSupplierSkus();
  const { user, logout } = useAuth();

  const handleRefresh = async () => {
    setRefreshing(true);
    await client.invalidateQueries();
    setRefreshing(false);
  };

  return (
    <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border">
      <div className="px-4 md:px-8 h-16 flex items-center justify-between">
        {/* Right: hamburger (mobile only) */}
        <div className="flex items-center">
          <button
            onClick={onMenuClick}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors lg:hidden"
            aria-label="פתח תפריט"
          >
            <span className="text-xl text-foreground">
              <MaterialIcon name="menu" />
            </span>
          </button>
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
            className="h-8 w-8 hidden sm:inline-flex hover:bg-white/10"
          >
            <span className={`text-base ${(syncMutation.isPending || syncSkusMutation.isPending) ? "animate-spin" : ""}`}>
              <MaterialIcon name="sync" />
            </span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
            title="רענן נתונים"
            className="h-8 w-8 hover:bg-white/10"
          >
            <span className={`text-base ${refreshing ? "animate-spin" : ""}`}>
              <MaterialIcon name="refresh" />
            </span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { navigator.clipboard.writeText("").catch(() => {}); }}
            title="התראות"
            className="h-8 w-8 hover:bg-white/10"
          >
            <span className="text-base text-primary">
              <MaterialIcon name="notifications" />
            </span>
          </Button>
          {user && (
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              title={`התנתק (${user.email})`}
              className="h-8 w-8 hover:bg-white/10"
            >
              <span className="text-base">
                <MaterialIcon name="logout" />
              </span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
