import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useStockJumpDetector } from "@/hooks/useStockJumpDetector";
import { useArrivedFlags } from "@/hooks/useArrivedFlags";
import { MaterialIcon } from "@/components/ui/MaterialIcon";

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
            <span className="text-lg text-green-400"><MaterialIcon name="package_2" /></span>
            זוהתה קפיצת מלאי
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="font-medium text-base">{current.product.name}</div>
          <div className="text-muted-foreground">מק״ט: {current.product.sku}</div>

          <div className="flex items-center gap-2 bg-green-500/10 rounded-lg p-3">
            <span className="text-base text-green-400"><MaterialIcon name="arrow_upward" /></span>
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
            <span className="text-base ml-1"><MaterialIcon name="close" /></span>
            לא
          </Button>
          <Button onClick={handleConfirm}>
            <span className="text-base ml-1"><MaterialIcon name="package_2" /></span>
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
