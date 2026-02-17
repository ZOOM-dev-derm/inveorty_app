import { useOpenOrders, useUpdateOrderStatus, useUpdateOrderComments } from "@/hooks/useSheetData";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AddOrderDialog } from "./AddOrderDialog";
import { ShoppingCart, Loader2, Check, Calendar, Package, Clock, MessageSquare, Send } from "lucide-react";
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

function OrderItem({ order, index, mode }: { order: Order; index: number; mode: GroupMode }) {
  const statusMutation = useUpdateOrderStatus();
  const commentsMutation = useUpdateOrderComments();
  const { date: expectedDate, estimated } = getExpectedDate(order);
  const overdue = isOverdue(order);
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
      className="order-detail py-3 border-b border-border/20 last:border-0"
      style={{
        opacity: 0,
        transform: "translateY(8px)",
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
                {mode === "date" ? order.productName : (order.orderDate || "לא ידוע")}
              </span>
              <Badge variant="outline" className="text-xs shrink-0 bg-muted/50">
                {order.quantity}
              </Badge>
            </div>
            {(order.dermaSku || order.supplierSku) && (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {[order.dermaSku, order.supplierSku].filter(Boolean).join(" | ")}
              </div>
            )}
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
        <div className="flex items-center gap-2 shrink-0">
          {expectedDate && (
            <span className={`text-xs ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              {formatDate(expectedDate)}
              {estimated && " *"}
            </span>
          )}
          {overdue && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              באיחור
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${hasComments ? "text-primary" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setShowComments((v) => !v);
            }}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {hasComments && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] rounded-full h-3.5 w-3.5 flex items-center justify-center">
                {commentEntries.length}
              </span>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={statusMutation.isPending}
            onClick={(e) => {
              e.stopPropagation();
              statusMutation.mutate({
                rowIndex: order.rowIndex,
                received: true,
              });
            }}
          >
            {statusMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
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

function OrderGroupCard({ group, mode }: { group: OrderGroup; mode: GroupMode }) {
  const Icon = mode === "date" ? Calendar : Package;

  return (
    <div
      className={`group relative rounded-xl border-2 p-4 transition-all duration-300 cursor-default shadow-sm
        ${group.hasOverdue
          ? "border-destructive/40 bg-gradient-to-br from-rose-50/50 via-white to-pink-50/30 hover:border-destructive/60 hover:shadow-lg hover:shadow-red-100/50"
          : "border-border/50 bg-gradient-to-br from-white via-background to-slate-50/30 hover:border-primary/30 hover:shadow-md"
        }`}
    >
      {/* Default state — always visible */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl ${group.hasOverdue ? "bg-destructive/10 ring-1 ring-destructive/20" : "bg-primary/10 ring-1 ring-primary/20"}`}>
            <Icon className={`h-4 w-4 ${group.hasOverdue ? "text-destructive" : "text-primary"}`} />
          </div>
          <div>
            <div className="font-bold text-base">{group.label}</div>
            <div className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <Package className="h-3 w-3" />
              {group.orders.length} פריטים
            </div>
          </div>
        </div>
        {group.hasOverdue && (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-destructive" />
            <span className="text-xs font-medium text-destructive">באיחור</span>
          </div>
        )}
      </div>

      {/* Hover reveal — order details */}
      <div className="mt-3 max-h-0 overflow-hidden transition-all duration-300 group-hover:max-h-[2000px]">
        <div className="pt-2 border-t border-border/30">
          {group.orders.map((order, idx) => (
            <OrderItem key={`${order.supplierSku}-${order.rowIndex}`} order={order} index={idx} mode={mode} />
          ))}
          <div className="text-[10px] text-muted-foreground mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-300">
            * תאריך משוער (תאריך הזמנה + 3 חודשים)
          </div>
        </div>
      </div>
    </div>
  );
}

export function OpenOrders({ search }: { search: string }) {
  const { data: orders, isLoading, error } = useOpenOrders();
  const [groupMode, setGroupMode] = useState<GroupMode>("date");

  const groups = useMemo<OrderGroup[]>(() => {
    if (!orders) return [];


    const terms = search.trim().toLowerCase().split(/\s+/);
    const filtered = terms.length > 0
      ? orders.filter((o) => {
        const searchable = `${o.productName || ""} ${o.orderDate || ""} ${o.dermaSku || ""} ${o.supplierSku || ""}`.toLowerCase();
        return terms.every((term) => searchable.includes(term));
      })
      : orders;

    const map = new Map<string, Order[]>();

    for (const order of filtered) {
      const key =
        groupMode === "date"
          ? order.orderDate || "לא ידוע"
          : order.productName || "לא ידוע";
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
  }, [orders, groupMode, search]);

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
            <OrderGroupCard key={group.label} group={group} mode={groupMode} />
          ))}
        </div>
      )}

      {/* Inject hover animation style */}
      <style>{`
        .group:hover .order-detail {
          opacity: 1 !important;
          transform: translateY(0) !important;
        }
      `}</style>
    </div>
  );
}
