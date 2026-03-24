import { useOrders, useProducts, useUpdateOrderStatus, useUpdateOrderComments, useSendFollowUp } from "@/hooks/useSheetData";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AddOrderDialog } from "./AddOrderDialog";
import { ShoppingCart, Loader2, Check, Calendar, Package, Clock, MessageSquare, Send, Mail, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { Order } from "@/types";

type GroupMode = "date" | "product";

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  // Handle both DD.MM.YY and DD/MM/YYYY formats
  const parts = dateStr.split(/[./]/);
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000;
  return new Date(year, month, day);
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function formatDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = String(date.getFullYear()).slice(-2);
  return `${d}.${m}.${y}`;
}

function getExpectedDate(order: Order): { date: Date | null; estimated: boolean } {
  if (order.expectedDate) {
    const parsed = parseDate(order.expectedDate);
    if (parsed) return { date: parsed, estimated: false };
  }
  const orderDate = parseDate(order.orderDate);
  if (orderDate) {
    return { date: addMonths(orderDate, 3), estimated: true };
  }
  return { date: null, estimated: false };
}

function isOverdue(order: Order): boolean {
  const { date } = getExpectedDate(order);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

interface OrderGroup {
  label: string;
  orders: Order[];
  hasOverdue: boolean;
}

function parseCommentLog(raw: string): { date: string; text: string }[] {
  if (!raw || !raw.trim()) return [];

  // Remove invisible formatting characters (like LTR/RTL marks)
  const cleanRaw = raw.replace(/[\u200B-\u200F\u202A-\u202E]/g, "").trim();

  const parts = cleanRaw.split("|");
  const parsed = parts.map((entry) => {
    const trimmed = entry.trim();
    // Match date with optional time: DD/MM/YYYY or DD/MM/YYYY HH:MM
    // Removed ^ anchor to be more forgiving of leading garbage
    const dateMatch = trimmed.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s+\d{1,2}:\d{2})?):\s*(.*)/);
    if (dateMatch) {
      return { date: dateMatch[1].trim(), text: dateMatch[2].trim() };
    }
    // Fallback: if no date pattern found, return the whole text as body
    return { date: "", text: trimmed };
  }).filter((e) => e.text);

  return parsed;
}

function OrderItem({ order, index, mode, expanded, skuNameMap }: { order: Order; index: number; mode: GroupMode; expanded?: boolean; skuNameMap: Map<string, string> }) {
  const statusMutation = useUpdateOrderStatus();
  const commentsMutation = useUpdateOrderComments();
  const followUpMutation = useSendFollowUp();
  const [followUpSent, setFollowUpSent] = useState(false);
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false);
  const [followUpMessage, setFollowUpMessage] = useState("");
  const { date: expectedDate, estimated } = getExpectedDate(order);
  const overdue = isOverdue(order);
  const received = isReceived(order);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");

  const commentEntries = useMemo(() => parseCommentLog(order.comments), [order.comments]);
  const hasComments = commentEntries.length > 0;

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2, "0")}/${(today.getMonth() + 1).toString().padStart(2, "0")}/${today.getFullYear()} ${today.getHours().toString().padStart(2, "0")}:${today.getMinutes().toString().padStart(2, "0")}`;
    const commentStr = `${dateStr}: ${newComment.trim()}`;
    commentsMutation.mutate(
      { rowIndex: order.rowIndex, comment: commentStr },
      {
        onSuccess: () => setNewComment(""),
        onError: (err) => {
          console.error("[Comments] Failed to save:", err);
          alert("שגיאה בשמירת ההערה. נסה שוב.");
        },
      }
    );
  };

  const lastTwoComments = commentEntries.slice(-2);

  return (
    <div
      className={`order-detail py-3 border-b border-border/20 last:border-0 ${received ? "opacity-60" : ""}`}
      style={{
        opacity: expanded ? 1 : 0,
        transform: expanded ? "translateY(0)" : "translateY(8px)",
        transition: "opacity 0.3s ease, transform 0.3s ease",
        transitionDelay: `${index * 40}ms`,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {mode === "date" ? (
            <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5 self-start" />
          ) : (
            <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5 self-start" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <span className="text-sm font-medium leading-snug">
                {mode === "date" ? (skuNameMap.get(order.dermaSku) || order.productName) : (order.orderDate || "לא ידוע")}
              </span>
              <Badge variant="outline" className="text-xs shrink-0 bg-muted/50">
                {order.quantity}
              </Badge>
            </div>
            {/* Order details grid */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-muted-foreground">
              {mode === "product" && order.orderDate && (
                <span><span className="font-medium">תאריך:</span> {order.orderDate}</span>
              )}
              {order.dermaSku && (
                <span><span className="font-medium">מק״ט דרמה:</span> <span className="text-foreground font-bold">{order.dermaSku}</span></span>
              )}
              {order.supplierSku && (
                <span><span className="font-medium">מק״ט פאר פארם:</span> {order.supplierSku}</span>
              )}
              {order.container && (
                <span><span className="font-medium">מיכל:</span> {order.container}</span>
              )}
              {expectedDate && (
                <span>
                  <span className="font-medium">תאריך צפוי:</span>{" "}
                  <span className={overdue ? "text-destructive font-medium" : ""}>{formatDate(expectedDate)}{estimated && " *"}</span>
                </span>
              )}
            </div>
            {lastTwoComments.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {lastTwoComments.map((entry, i) => (
                  <div key={i} className="text-[10px] text-muted-foreground/70 leading-tight truncate">
                    {entry.date && <span className="ml-1">{entry.date}:</span>} {entry.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {received && (
            <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-800 border-green-300">
              התקבל ✓
            </Badge>
          )}
          {overdue && !received && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              באיחור
            </Badge>
          )}
          {!received && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px] gap-1"
              disabled={statusMutation.isPending}
              title="סמן כהתקבל"
              onClick={(e) => {
                e.stopPropagation();
                statusMutation.mutate({
                  rowIndex: order.rowIndex,
                  received: true,
                });
              }}
            >
              {statusMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              התקבל
            </Button>
          )}
          <Button
            variant={hasComments ? "default" : "outline"}
            size="sm"
            className={`h-7 px-2 text-[11px] gap-1 relative ${showComments ? "ring-1 ring-primary/50" : ""}`}
            title="הצג/הוסף הערות"
            onClick={(e) => {
              e.stopPropagation();
              setShowComments((v) => !v);
            }}
          >
            <MessageSquare className="h-3 w-3" />
            הערות
            {hasComments && (
              <Badge variant="secondary" className="h-4 px-1 text-[9px] mr-0.5">
                {commentEntries.length}
              </Badge>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={`h-7 px-2 text-[11px] gap-1 ${followUpSent ? "bg-green-50 text-green-700 border-green-300" : ""}`}
            disabled={followUpMutation.isPending}
            title="שלח מייל מעקב לספק"
            onClick={(e) => {
              e.stopPropagation();
              setFollowUpMessage("שלום רב,\nאשמח לעדכון לגבי ההזמנה הבאה.");
              setShowFollowUpDialog(true);
            }}
          >
            {followUpMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : followUpSent ? (
              <Check className="h-3 w-3" />
            ) : (
              <Mail className="h-3 w-3" />
            )}
            {followUpSent ? "נשלח" : "מעקב"}
          </Button>
        </div>

        {/* Follow-up email confirmation dialog */}
        <Dialog open={showFollowUpDialog} onOpenChange={setShowFollowUpDialog}>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>שליחת מייל מעקב לספק</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground bg-muted/50 rounded-lg p-3">
                <span><span className="font-medium text-foreground">שם פריט:</span> {order.productName}</span>
                {order.supplierSku && <span><span className="font-medium text-foreground">מק״ט:</span> {order.supplierSku}</span>}
                <span><span className="font-medium text-foreground">כמות:</span> {order.quantity}</span>
                {order.orderDate && <span><span className="font-medium text-foreground">תאריך הזמנה:</span> {order.orderDate}</span>}
                {order.container && <span><span className="font-medium text-foreground">מיכל:</span> {order.container}</span>}
              </div>
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
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setShowFollowUpDialog(false)}>
                ביטול
              </Button>
              <Button
                disabled={followUpMutation.isPending}
                onClick={() => {
                  followUpMutation.mutate(
                    {
                      rowIndex: order.rowIndex,
                      orderDate: order.orderDate,
                      supplierSku: order.supplierSku,
                      dermaSku: order.dermaSku,
                      quantity: order.quantity,
                      productName: order.productName,
                      expectedDate: order.expectedDate,
                      container: order.container,
                      customMessage: followUpMessage.trim() || undefined,
                    },
                    {
                      onSuccess: () => {
                        setShowFollowUpDialog(false);
                        setFollowUpSent(true);
                        setTimeout(() => setFollowUpSent(false), 3000);
                      },
                      onError: (err) => {
                        console.error("[FollowUp] Failed:", err);
                        alert("שגיאה בשליחת מייל מעקב. נסה שוב.");
                      },
                    }
                  );
                }}
              >
                {followUpMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                ) : (
                  <Send className="h-4 w-4 ml-2" />
                )}
                שלח מייל
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Comment log section */}
      {showComments && (
        <div className="mt-2 mr-6 border-t border-border/20 pt-2">
          {commentEntries.length > 0 && (
            <div className="space-y-1 mb-2">
              {commentEntries.map((entry, i) => (
                <div key={i} className="flex gap-2 text-xs">
                  {entry.date && (
                    <span className="text-muted-foreground shrink-0">{entry.date}</span>
                  )}
                  <span>{entry.text}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddComment(); }}
              placeholder="הוסף הערה..."
              className="flex-1 text-xs border border-border/50 rounded-md px-2 py-1 bg-background"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={commentsMutation.isPending || !newComment.trim()}
              onClick={(e) => {
                e.stopPropagation();
                handleAddComment();
              }}
            >
              {commentsMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderGroupCard({ group, mode, skuNameMap }: { group: OrderGroup; mode: GroupMode; skuNameMap: Map<string, string> }) {
  const Icon = mode === "date" ? Calendar : Package;
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`relative rounded-xl border-2 p-4 transition-all duration-300 shadow-sm
        ${group.hasOverdue
          ? "border-destructive/40 bg-gradient-to-br from-rose-50/50 via-white to-pink-50/30 hover:border-destructive/60 hover:shadow-lg hover:shadow-red-100/50"
          : "border-border/50 bg-gradient-to-br from-white via-background to-slate-50/30 hover:border-primary/30 hover:shadow-md"
        }`}
    >
      {/* Header — always visible, tappable */}
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl ${group.hasOverdue ? "bg-destructive/10 ring-1 ring-destructive/20" : "bg-primary/10 ring-1 ring-primary/20"}`}>
            <Icon className={`h-4 w-4 ${group.hasOverdue ? "text-destructive" : "text-primary"}`} />
          </div>
          <div>
            <div className="font-bold text-base">{group.label}</div>
            <div className="text-xs text-muted-foreground font-medium flex items-center gap-1 flex-wrap">
              <Package className="h-3 w-3" />
              {group.orders.length} פריטים
              {mode === "product" && group.orders[0]?.dermaSku && (
                <>
                  <span className="mx-0.5">·</span>
                  <span>{group.orders[0].dermaSku}</span>
                </>
              )}
              {mode === "product" && group.orders[0]?.supplierSku && (
                <>
                  <span className="mx-0.5">·</span>
                  <span>{group.orders[0].supplierSku}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {group.hasOverdue && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-destructive" />
              <span className="text-xs font-medium text-destructive">באיחור</span>
            </div>
          )}
          <svg
            className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expandable order details */}
      <div
        className="mt-3 overflow-hidden transition-all duration-300"
        style={{ maxHeight: expanded ? `${group.orders.length * 160 + 80}px` : "0px" }}
      >
        <div className="pt-2 border-t border-border/30">
          {group.orders.map((order, idx) => (
            <OrderItem key={`${order.dermaSku}-${order.rowIndex}`} order={order} index={idx} mode={mode} expanded={expanded} skuNameMap={skuNameMap} />
          ))}
          <div className={`text-[10px] text-muted-foreground mt-2 transition-opacity duration-500 delay-300 ${expanded ? "opacity-100" : "opacity-0"}`}>
            * תאריך משוער (תאריך הזמנה + 3 חודשים)
          </div>
        </div>
      </div>
    </div>
  );
}

const RECEIVED_VALUES = ["כן", "v", "✓", "true", "yes"];

function isReceived(order: Order): boolean {
  return RECEIVED_VALUES.includes((order.received || "").toString().trim().toLowerCase());
}

export function OpenOrders({ search, showReceived = false }: { search: string; showReceived?: boolean }) {
  const { data: allOrders, isLoading, error } = useOrders();
  const orders = useMemo(() => {
    if (!allOrders) return [];
    if (showReceived) return allOrders;
    return allOrders.filter((o) => !isReceived(o));
  }, [allOrders, showReceived]);
  const { data: products } = useProducts();
  const [groupMode, setGroupMode] = useState<GroupMode>("date");

  const skuNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (products) {
      for (const p of products) {
        if (p.sku) map.set(p.sku, p.name);
      }
    }
    return map;
  }, [products]);


  const groups = useMemo<OrderGroup[]>(() => {
    if (!orders) return [];


    const terms = search.trim().toLowerCase().split(/\s+/);
    const filtered = terms.length > 0
      ? orders.filter((o) => {
        const lookedUpName = skuNameMap.get(o.dermaSku) || "";
        const searchable = `${lookedUpName} ${o.productName || ""} ${o.orderDate || ""} ${o.dermaSku || ""}`.toLowerCase();
        return terms.every((term) => searchable.includes(term));
      })
      : orders;

    const map = new Map<string, Order[]>();

    for (const order of filtered) {
      const key =
        groupMode === "date"
          ? order.orderDate || "לא ידוע"
          : (skuNameMap.get(order.dermaSku) || order.productName || "לא ידוע");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(order);
    }

    const entries = Array.from(map.entries()).map(([label, ords]) => ({
      label,
      orders: ords,
      hasOverdue: ords.some(isOverdue),
    }));

    entries.sort((a, b) => {
      // Overdue groups first
      if (a.hasOverdue !== b.hasOverdue) return a.hasOverdue ? -1 : 1;
      // Then by date or name
      if (groupMode === "date") {
        const da = parseDate(a.label);
        const db = parseDate(b.label);
        if (!da || !db) return 0;
        return db.getTime() - da.getTime();
      } else {
        return a.label.localeCompare(b.label, "he");
      }
    });

    return entries;
  }, [orders, groupMode, search, skuNameMap]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">הזמנות פתוחות</h2>
          {!isLoading && orders && (
            <Badge variant="outline">{orders.length}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 p-1 rounded-lg bg-muted">
            <button
              onClick={() => setGroupMode("date")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${groupMode === "date"
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              לפי תאריך
            </button>
            <button
              onClick={() => setGroupMode("product")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${groupMode === "product"
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <Package className="h-3.5 w-3.5" />
              לפי מוצר
            </button>
          </div>
          <AddOrderDialog />
        </div>
      </div>

      {/* States */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && (
        <p className="text-destructive text-sm">שגיאה בטעינת הנתונים</p>
      )}
      {!isLoading && !error && groups.length === 0 && (
        <p className="text-muted-foreground text-sm text-center py-8">
          {search.trim() ? "לא נמצאו הזמנות תואמות" : "אין הזמנות פתוחות"}
        </p>
      )}

      {/* Cards grid */}
      {!isLoading && !error && groups.length > 0 && (
        <div className="grid gap-4 grid-cols-1">
          {groups.map((group) => (
            <OrderGroupCard key={group.label} group={group} mode={groupMode} skuNameMap={skuNameMap} />
          ))}
        </div>
      )}

      {/* No injected hover styles needed — expansion is JS-driven */}
    </div>
  );
}
