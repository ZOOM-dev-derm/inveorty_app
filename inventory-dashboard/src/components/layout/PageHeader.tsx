import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  badge?: string | number;
  actions?: ReactNode;
}

export function PageHeader({ title, badge, actions }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">{title}</h1>
        {badge != null && (
          <Badge variant="outline" className="text-xs">{badge}</Badge>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
