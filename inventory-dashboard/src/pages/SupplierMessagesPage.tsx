import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useSupplierMessages,
  useOpenOrders,
  useLinkSupplierMessage,
  useSendFollowUp,
  useSendFreeEmail,
  useUpdateOrderComments,
} from "@/hooks/useSheetData";
import type { SupplierMessage, Order } from "@/types";
import { MaterialIcon } from "@/components/ui/MaterialIcon";

export function SupplierMessagesPage() {
  const { data: messages, isLoading } = useSupplierMessages();
  const { data: openOrders } = useOpenOrders();
  const [tab, setTab] = useState<"pending" | "handled">("pending");
  const [supplierFilter, setSupplierFilter] = useState("פאר פארם");
  const [showComposeDialog, setShowComposeDialog] = useState(false);

  const pending = messages?.filter((m) => m.handled !== "כן") ?? [];
  const handled = messages?.filter((m) => m.handled === "כן") ?? [];
  const shown = tab === "pending" ? pending : handled;

  return (
    <>
      <PageHeader
        title="הודעות ספק"
        badge={pending.length > 0 ? pending.length : undefined}
        actions={
          <>
            <Select value={supplierFilter} onValueChange={setSupplierFilter} dir="rtl">
              <SelectTrigger className="w-[140px]" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="הכל">הכל</SelectItem>
                <SelectItem value="פאר פארם">פאר פארם</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setShowComposeDialog(true)}>
              <span className="text-base ml-1"><MaterialIcon name="edit" /></span>
              הודעה חדשה
            </Button>
          </>
        }
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={tab === "pending" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("pending")}
        >
          <span className="text-base ml-1.5"><MaterialIcon name="schedule" /></span>
          ממתינים
          {pending.length > 0 && (
            <Badge variant="secondary" className="mr-1.5 text-xs">
              {pending.length}
            </Badge>
          )}
        </Button>
        <Button
          variant={tab === "handled" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("handled")}
        >
          <span className="text-base ml-1.5"><MaterialIcon name="check_circle" /></span>
          טופלו
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <span className="text-lg animate-spin ml-2"><MaterialIcon name="progress_activity" /></span>
          טוען הודעות...
        </div>
      )}

      {!isLoading && shown.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          {tab === "pending"
            ? "אין הודעות ממתינות"
            : "אין הודעות שטופלו"}
        </div>
      )}

      <div className="space-y-3">
        {shown.map((msg) => (
          <MessageCard
            key={`${msg.rowIndex}-${msg.supplierSku}`}
            message={msg}
            openOrders={openOrders ?? []}
            isPending={tab === "pending"}
          />
        ))}
      </div>

      {/* Compose dialog */}
      <ComposeDialog
        open={showComposeDialog}
        onOpenChange={setShowComposeDialog}
        openOrders={openOrders ?? []}
      />
    </>
  );
}

// ── Compose Dialog ──

function ComposeDialog({
  open,
  onOpenChange,
  openOrders,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openOrders: Order[];
}) {
  const freeEmailMutation = useSendFreeEmail();
  const followUpMutation = useSendFollowUp();

  const [mode, setMode] = useState<"free" | "followup">("free");
  const [freeSubject, setFreeSubject] = useState("");
  const [freeBody, setFreeBody] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [followUpMessage, setFollowUpMessage] = useState(
    "שלום רב,\nאבקש לקבל מה צפי תאריך היצור של ההזמנה ומתי נקבל אותה?"
  );
  const [sent, setSent] = useState(false);

  const selectedOrder = openOrders.find(
    (o) => o.rowIndex.toString() === selectedOrderId
  );

  const resetState = () => {
    setMode("free");
    setFreeSubject("");
    setFreeBody("");
    setSelectedOrderId("");
    setFollowUpMessage("שלום רב,\nאבקש לקבל מה צפי תאריך היצור של ההזמנה ומתי נקבל אותה?");
    setSent(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) resetState();
    onOpenChange(v);
  };

  const handleSendFree = () => {
    if (!freeSubject.trim()) return;
    freeEmailMutation.mutate(
      { subject: freeSubject.trim(), body: freeBody.trim() },
      {
        onSuccess: () => {
          setSent(true);
          setTimeout(() => handleOpenChange(false), 1500);
        },
        onError: (err) => {
          console.error("[FreeEmail] Failed:", err);
          alert("שגיאה בשליחת המייל. נסה שוב.");
        },
      }
    );
  };

  const handleSendFollowUp = () => {
    if (!selectedOrder) return;
    followUpMutation.mutate(
      {
        rowIndex: selectedOrder.rowIndex,
        orderDate: selectedOrder.orderDate,
        supplierSku: selectedOrder.supplierSku,
        dermaSku: selectedOrder.dermaSku,
        quantity: selectedOrder.quantity,
        productName: selectedOrder.productName,
        expectedDate: selectedOrder.expectedDate,
        container: selectedOrder.container,
        customMessage: followUpMessage.trim() || undefined,
      },
      {
        onSuccess: () => {
          setSent(true);
          setTimeout(() => handleOpenChange(false), 1500);
        },
        onError: (err) => {
          console.error("[FollowUp] Failed:", err);
          alert("שגיאה בשליחת מייל מעקב. נסה שוב.");
        },
      }
    );
  };

  const isPending = freeEmailMutation.isPending || followUpMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>הודעה חדשה לספק</DialogTitle>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex gap-2">
          <Button
            variant={mode === "free" ? "default" : "outline"}
            size="sm"
            className="flex-1"
            onClick={() => setMode("free")}
          >
            <span className="text-base ml-1"><MaterialIcon name="mail" /></span>
            מייל חופשי
          </Button>
          <Button
            variant={mode === "followup" ? "default" : "outline"}
            size="sm"
            className="flex-1"
            onClick={() => setMode("followup")}
          >
            <span className="text-base ml-1"><MaterialIcon name="reply" /></span>
            מעקב הזמנה
          </Button>
        </div>

        {sent ? (
          <div className="flex items-center justify-center py-8 gap-2 text-green-400">
            <span className="text-2xl"><MaterialIcon name="check_circle" /></span>
            <span className="text-lg font-medium">נשלח בהצלחה</span>
          </div>
        ) : mode === "free" ? (
          /* Free email mode */
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">נושא:</label>
              <Input
                value={freeSubject}
                onChange={(e) => setFreeSubject(e.target.value)}
                placeholder="נושא ההודעה..."
                dir="rtl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">תוכן:</label>
              <textarea
                value={freeBody}
                onChange={(e) => setFreeBody(e.target.value)}
                placeholder="תוכן ההודעה..."
                className="w-full min-h-[120px] text-sm border border-border rounded-lg px-3 py-2 bg-background resize-y"
                dir="rtl"
              />
            </div>
          </div>
        ) : (
          /* Follow-up mode */
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">בחר הזמנה:</label>
              <Select value={selectedOrderId} onValueChange={setSelectedOrderId} dir="rtl">
                <SelectTrigger>
                  <SelectValue placeholder="בחר הזמנה..." />
                </SelectTrigger>
                <SelectContent>
                  {openOrders.map((order) => (
                    <SelectItem key={order.rowIndex} value={order.rowIndex.toString()}>
                      {order.productName} — {order.quantity} יח' — {order.orderDate}
                      {order.dermaSku ? ` (${order.dermaSku})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedOrder && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground bg-white/5 rounded-lg p-3">
                <span><span className="font-medium text-foreground">שם פריט:</span> {selectedOrder.productName}</span>
                {selectedOrder.supplierSku && <span><span className="font-medium text-foreground">מק״ט:</span> {selectedOrder.supplierSku}</span>}
                <span><span className="font-medium text-foreground">כמות:</span> {selectedOrder.quantity}</span>
                {selectedOrder.orderDate && <span><span className="font-medium text-foreground">תאריך:</span> {selectedOrder.orderDate}</span>}
                {selectedOrder.container && <span><span className="font-medium text-foreground">מיכל:</span> {selectedOrder.container}</span>}
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">הודעה לספק:</label>
              <textarea
                value={followUpMessage}
                onChange={(e) => setFollowUpMessage(e.target.value)}
                className="w-full min-h-[100px] text-sm border border-border rounded-lg px-3 py-2 bg-background resize-y"
                dir="rtl"
              />
            </div>
          </div>
        )}

        {!sent && (
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              ביטול
            </Button>
            <Button
              disabled={isPending || (mode === "free" ? !freeSubject.trim() : !selectedOrder)}
              onClick={mode === "free" ? handleSendFree : handleSendFollowUp}
            >
              {isPending ? (
                <span className="text-base animate-spin ml-2"><MaterialIcon name="progress_activity" /></span>
              ) : (
                <span className="text-base ml-2"><MaterialIcon name="send" /></span>
              )}
              שלח מייל
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Message Card ──

function MessageCard({
  message,
  openOrders,
  isPending,
}: {
  message: SupplierMessage;
  openOrders: Order[];
  isPending: boolean;
}) {
  const linkMutation = useLinkSupplierMessage();
  const commentsMutation = useUpdateOrderComments();
  const [selectedOrder, setSelectedOrder] = useState<string>("");

  // Note to order state
  const [showNoteSection, setShowNoteSection] = useState(false);
  const [noteOrderId, setNoteOrderId] = useState<string>(message.linkedOrder || "");
  const [noteText, setNoteText] = useState("");

  // Find matching orders for this supplier SKU
  const matchingOrders = openOrders.filter(
    (o) =>
      o.supplierSku === message.supplierSku ||
      o.dermaSku === message.supplierSku
  );

  const handleLink = () => {
    const orderRowIndex = parseInt(selectedOrder, 10);
    if (!orderRowIndex) return;

    const logEntry = `${message.date}: [ספק] ${message.status}${
      message.quantity ? ` - ${message.quantity} יח'` : ""
    }`;

    linkMutation.mutate({
      messageRowIndex: message.rowIndex,
      orderRowIndex,
      logEntry,
      expectedDate: message.expectedDate || undefined,
    });
  };

  const handleAddNote = () => {
    const orderRowIndex = parseInt(noteOrderId, 10);
    if (!orderRowIndex || !noteText.trim()) return;

    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, "0")}/${(today.getMonth() + 1).toString().padStart(2, "0")}/${today.getFullYear()} ${today.getHours().toString().padStart(2, "0")}:${today.getMinutes().toString().padStart(2, "0")}`;
    const commentStr = `${dateStr}: [ספק] ${noteText.trim()}`;

    commentsMutation.mutate(
      { rowIndex: orderRowIndex, comment: commentStr },
      {
        onSuccess: () => {
          setNoteText("");
          setShowNoteSection(false);
        },
        onError: (err) => {
          console.error("[Note] Failed to save:", err);
          alert("שגיאה בשמירת ההערה. נסה שוב.");
        },
      }
    );
  };

  return (
    <Card>
      <CardContent className="py-4 px-4">
        <div className="flex flex-col gap-3">
          {/* Top row: date + subject */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs shrink-0">
                  {message.date}
                </Badge>
                {message.subject && (
                  <span className="text-sm text-muted-foreground truncate">
                    {message.subject}
                  </span>
                )}
              </div>
            </div>
            {!isPending && (
              <Badge
                variant="secondary"
                className="bg-green-500/10 text-green-400 text-xs shrink-0"
              >
                טופל
              </Badge>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span>
              <span className="font-medium">מק״ט:</span> {message.supplierSku}
            </span>
            <span>
              <span className="font-medium">סטטוס:</span>{" "}
              <span className="text-primary font-medium">{message.status}</span>
            </span>
            {message.quantity && (
              <span>
                <span className="font-medium">כמות:</span> {message.quantity}
              </span>
            )}
            {message.expectedDate && (
              <span>
                <span className="font-medium">צפי:</span>{" "}
                {message.expectedDate}
              </span>
            )}
          </div>

          {/* Link to order (pending only) */}
          {isPending && (
            <div className="flex items-center gap-2 pt-1">
              {matchingOrders.length > 0 ? (
                <>
                  <Select
                    value={selectedOrder}
                    onValueChange={setSelectedOrder}
                    dir="rtl"
                  >
                    <SelectTrigger className="flex-1 min-w-[200px]" size="sm">
                      <SelectValue placeholder="בחר הזמנה לשיוך..." />
                    </SelectTrigger>
                    <SelectContent>
                      {matchingOrders.map((order) => (
                        <SelectItem
                          key={order.rowIndex}
                          value={order.rowIndex.toString()}
                        >
                          {order.productName} — {order.quantity} יח' —{" "}
                          {order.orderDate}
                          {order.dermaSku ? ` (${order.dermaSku})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={handleLink}
                    disabled={!selectedOrder || linkMutation.isPending}
                  >
                    {linkMutation.isPending ? (
                      <span className="text-base animate-spin"><MaterialIcon name="progress_activity" /></span>
                    ) : (
                      <span className="text-base ml-1"><MaterialIcon name="link" /></span>
                    )}
                    שייך
                  </Button>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">
                  לא נמצאו הזמנות פתוחות למק״ט {message.supplierSku}
                </span>
              )}
            </div>
          )}

          {/* Linked order info (handled) */}
          {!isPending && message.linkedOrder && (
            <div className="text-xs text-muted-foreground">
              שויך לשורה {message.linkedOrder}
            </div>
          )}

          {/* Add note to order */}
          <div className="flex items-center gap-2 pt-1 border-t border-border/20">
            <Button
              variant={showNoteSection ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-[11px] gap-1"
              onClick={() => setShowNoteSection((v) => !v)}
            >
              <span className="text-sm"><MaterialIcon name="add_comment" /></span>
              הוסף הערה להזמנה
            </Button>
          </div>

          {showNoteSection && (
            <div className="space-y-2 pr-2">
              <Select value={noteOrderId} onValueChange={setNoteOrderId} dir="rtl">
                <SelectTrigger size="sm">
                  <SelectValue placeholder="בחר הזמנה..." />
                </SelectTrigger>
                <SelectContent>
                  {openOrders.map((order) => (
                    <SelectItem
                      key={order.rowIndex}
                      value={order.rowIndex.toString()}
                    >
                      {order.productName} — {order.quantity} יח' — {order.orderDate}
                      {order.dermaSku ? ` (${order.dermaSku})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="הערה..."
                  dir="rtl"
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddNote();
                  }}
                />
                <Button
                  size="sm"
                  disabled={!noteOrderId || !noteText.trim() || commentsMutation.isPending}
                  onClick={handleAddNote}
                >
                  {commentsMutation.isPending ? (
                    <span className="text-sm animate-spin"><MaterialIcon name="progress_activity" /></span>
                  ) : (
                    <span className="text-sm"><MaterialIcon name="send" /></span>
                  )}
                  הוסף
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
