import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useStockJumpDetector } from "@/hooks/useStockJumpDetector";
import { useArrivedFlags } from "@/hooks/useArrivedFlags";
import { PackageCheck, X, ArrowUp } from "lucide-react";

export function StockJumpAlert() {
  const { pendingMatches, dismiss, removeMatch } = useStockJumpDetector();
  const { flagAsArrived } = useArrivedFlags();

  const current = pendingMatches[0];
  if (!current) return null;

  const handleConfirm = () => {
    flagAsArrived(current);
    removeMatch(current.order.rowIndex);
  };

  const handleDismiss = () => {
    dismiss(current.order.rowIndex);
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) handleDismiss(); }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-green-600" />
            זוהתה קפיצת מלאי
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="font-medium text-base">{current.product.name}</div>
          <div className="text-muted-foreground">מק״ט: {current.product.sku}</div>

          <div className="flex items-center gap-2 bg-green-50 dark:bg-green-950/30 rounded-lg p-3">
            <ArrowUp className="h-4 w-4 text-green-600" />
            <span>
              מלאי עלה מ-<strong>{current.oldStock}</strong> ל-<strong>{current.newStock}</strong>
              {" "}
              (<strong>+{current.jump}</strong>)
            </span>
          </div>

          <div className="border rounded-lg p-3 space-y-1">
            <div className="font-medium">הזמנה תואמת:</div>
            <div>כמות: <strong>{current.order.quantity}</strong> יח׳</div>
            <div>תאריך הזמנה: {current.order.orderDate}</div>
            {current.order.expectedDate && (
              <div>תאריך צפי: {current.order.expectedDate}</div>
            )}
          </div>

          <div className="font-medium text-center">האם ההזמנה הגיעה?</div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleDismiss}>
            <X className="h-4 w-4 ml-1" />
            לא
          </Button>
          <Button onClick={handleConfirm}>
            <PackageCheck className="h-4 w-4 ml-1" />
            כן, הגיעה
          </Button>
        </DialogFooter>

        {pendingMatches.length > 1 && (
          <div className="text-center text-xs text-muted-foreground">
            {pendingMatches.length - 1} הזמנות נוספות ממתינות לאישור
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
