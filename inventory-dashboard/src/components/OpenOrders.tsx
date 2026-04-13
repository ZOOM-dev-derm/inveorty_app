import { useOrders, useProducts, useUpdateOrderStatus, useUpdateOrderComments, useSendFollowUp, useUpdateOrderFields, useDeleteOrder } from "@/hooks/useSheetData";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AddOrderDialog } from "./AddOrderDialog";
import { MaterialIcon } from "@/components/ui/MaterialIcon";
import { useMemo, useState } from "react";
import type { Order } from "@/types";
import { useArrivedFlags, type ArrivedFlag } from "@/hooks/useArrivedFlags";

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

function OrderItem({ order, index, mode, expanded, skuNameMap, arrivedFlag, onRemoveArrivedFlag }: { order: Order; index: number; mode: GroupMode; expanded?: boolean; skuNameMap: Map<string, string>; arrivedFlag?: ArrivedFlag; onRemoveArrivedFlag?: (rowIndex: number) => void }) {
  const statusMutation = useUpdateOrderStatus();
  const commentsMutation = useUpdateOrderComments();
  const followUpMutation = useSendFollowUp();
  const updateFieldsMutation = useUpdateOrderFields();
  const deleteOrderMutation = useDeleteOrder();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [followUpSent, setFollowUpSent] = useState(false);
  const [showArrivedDetails, setShowArrivedDetails] = useState(false);
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false);
  const [followUpMessage, setFollowUpMessage] = useState("");
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editExpectedDate, setEditExpectedDate] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editComments, setEditComments] = useState("");
  const [editContainer, setEditContainer] = useState("");
  const [editDistribution, setEditDistribution] = useState("");
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
            <span className="text-sm text-muted-foreground shrink-0 mt-0.5 self-start"><MaterialIcon name="inventory_2" /></span>
          ) : (
            <span className="text-sm text-muted-foreground shrink-0 mt-0.5 self-start"><MaterialIcon name="calendar_today" /></span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <span className="text-sm font-medium leading-snug">
                {mode === "date" ? (skuNameMap.get(order.dermaSku) || order.productName) : (order.orderDate || "לא ידוע")}
              </span>
              <Badge variant="outline" className="text-xs shrink-0 bg-white/5">
                {order.quantity}
              </Badge>
            </div>
            {/* Order details grid */}
            <div className="mt-2 bg-muted/10 rounded-lg p-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px]">
              {mode === "product" && order.orderDate && (
                <div>
                  <span className="text-muted-foreground font-medium">תאריך:</span>{" "}
                  <span className="text-foreground">{order.orderDate}</span>
                </div>
              )}
              {order.dermaSku && (
                <div>
                  <span className="text-muted-foreground font-medium">מק״ט דרמה:</span>{" "}
                  <span className="text-foreground font-bold">{order.dermaSku}</span>
                </div>
              )}
              {order.supplierSku && (
                <div>
                  <span className="text-muted-foreground font-medium">מק״ט פאר פארם:</span>{" "}
                  <span className="text-foreground">{order.supplierSku}</span>
                </div>
              )}
              {order.container && (
                <div>
                  <span className="text-muted-foreground font-medium">מיכל:</span>{" "}
                  <span className="text-foreground">{order.container}</span>
                </div>
              )}
              {expectedDate && (
                <div>
                  <span className="text-muted-foreground font-medium">תאריך צפוי:</span>{" "}
                  <span className={overdue ? "text-destructive font-bold" : "text-foreground"}>{formatDate(expectedDate)}{estimated && " *"}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {!received && arrivedFlag && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px] gap-1 bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20"
              title="הצג פרטי הגעה"
              onClick={(e) => {
                e.stopPropagation();
                setShowArrivedDetails((v) => !v);
              }}
            >
              <span className="text-sm"><MaterialIcon name="package_2" /></span>
              הגיעה
            </Button>
          )}
          {!received && !arrivedFlag && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-[11px] gap-1.5 rounded-full bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
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
                <span className="text-sm animate-spin"><MaterialIcon name="progress_activity" /></span>
              ) : (
                <span className="text-sm"><MaterialIcon name="check_circle" /></span>
              )}
              התקבל
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className={`h-8 px-3 text-[11px] gap-1.5 rounded-full ${hasComments ? "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100" : "bg-blue-50/50 text-blue-500 border-blue-100 hover:bg-blue-50"} ${showComments ? "ring-2 ring-blue-200" : ""}`}
            title="הצג/הוסף הערות"
            onClick={(e) => {
              e.stopPropagation();
              setShowComments((v) => !v);
            }}
          >
            <span className="text-sm"><MaterialIcon name="chat" /></span>
            הערות
            {hasComments && (
              <Badge variant="secondary" className="h-4 px-1 text-[9px] mr-0.5 bg-blue-100 text-blue-600">
                {commentEntries.length}
              </Badge>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={`h-8 px-3 text-[11px] gap-1.5 rounded-full ${followUpSent ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100"}`}
            disabled={followUpMutation.isPending}
            title="שלח מייל מעקב לספק"
            onClick={(e) => {
              e.stopPropagation();
              setFollowUpMessage("שלום רב,\nאבקש לקבל מה צפי תאריך היצור של ההזמנה ומתי נקבל אותה?");
              setShowFollowUpDialog(true);
            }}
          >
            {followUpMutation.isPending ? (
              <span className="text-sm animate-spin"><MaterialIcon name="progress_activity" /></span>
            ) : followUpSent ? (
              <span className="text-sm"><MaterialIcon name="check" /></span>
            ) : (
              <span className="text-sm"><MaterialIcon name="mail" /></span>
            )}
            {followUpSent ? "נשלח" : "מעקב"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-[11px] gap-1.5 rounded-full bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
            title="ערוך הזמנה"
            onClick={(e) => {
              e.stopPropagation();
              setEditExpectedDate(order.expectedDate || "");
              setEditQuantity(order.quantity || "");
              setEditComments(order.comments || "");
              setEditContainer(order.container || "");
              setEditDistribution(order.distributionNotes || "");
              setShowEditDialog(true);
            }}
          >
            <span className="text-sm"><MaterialIcon name="edit" /></span>
            עריכה
          </Button>
        </div>

        {/* Follow-up email confirmation dialog */}
        <Dialog open={showFollowUpDialog} onOpenChange={setShowFollowUpDialog}>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>שליחת מייל מעקב לספק</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground bg-white/5 rounded-lg p-3">
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
                  <span className="text-base animate-spin ml-2"><MaterialIcon name="progress_activity" /></span>
                ) : (
                  <span className="text-base ml-2"><MaterialIcon name="send" /></span>
                )}
                שלח מייל
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

        {/* Edit order dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>עריכת הזמנה — {order.productName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">כמות</label>
                  <input
                    type="text"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(e.target.value)}
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">תאריך צפי</label>
                  <input
                    type="date"
                    value={(() => {
                      // Convert DD/MM/YYYY to YYYY-MM-DD for input[type=date]
                      const parts = editExpectedDate.split(/[\/.\-]/);
                      if (parts.length === 3) {
                        const [d, m, y] = parts;
                        const year = y.length === 2 ? "20" + y : y;
                        return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
                      }
                      return editExpectedDate;
                    })()}
                    onChange={(e) => {
                      // Convert YYYY-MM-DD back to DD/MM/YYYY
                      const val = e.target.value;
                      if (val) {
                        const [y, m, d] = val.split("-");
                        setEditExpectedDate(`${d}/${m}/${y}`);
                      } else {
                        setEditExpectedDate("");
                      }
                    }}
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">מיכל</label>
                <input
                  type="text"
                  value={editContainer}
                  onChange={(e) => setEditContainer(e.target.value)}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">חלוקה+הערות</label>
                <input
                  type="text"
                  value={editDistribution}
                  onChange={(e) => setEditDistribution(e.target.value)}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">לוג/הערות (ניתן לערוך ולמחוק)</label>
                <textarea
                  value={editComments}
                  onChange={(e) => setEditComments(e.target.value)}
                  className="w-full min-h-[100px] text-sm border border-border rounded-lg px-3 py-2 bg-background resize-y font-mono text-xs"
                  dir="rtl"
                />
                <p className="text-[10px] text-muted-foreground mt-1">כל שורה מופרדת ב-|. ניתן למחוק, לערוך או להוסיף.</p>
              </div>
            </div>
            <DialogFooter className="flex-col gap-3 sm:flex-col">
              <div className="flex gap-2 justify-end w-full">
                <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                  ביטול
                </Button>
                <Button
                  disabled={updateFieldsMutation.isPending}
                  onClick={() => {
                    const fields: Record<string, string> = {};
                    if (editQuantity !== order.quantity) fields['כמות סה"כ'] = editQuantity;
                    if (editExpectedDate !== (order.expectedDate || "")) fields["תאריך צפי"] = editExpectedDate;
                    if (editContainer !== (order.container || "")) fields["מיכל"] = editContainer;
                    if (editDistribution !== (order.distributionNotes || "")) fields["חלוקה+הערות"] = editDistribution;

                    const commentsChanged = editComments !== (order.comments || "");

                    if (Object.keys(fields).length === 0 && !commentsChanged) {
                      setShowEditDialog(false);
                      return;
                    }

                    updateFieldsMutation.mutate(
                      {
                        rowIndex: order.rowIndex,
                        fields,
                        replaceComments: commentsChanged ? editComments : undefined,
                      },
                      {
                        onSuccess: () => setShowEditDialog(false),
                        onError: (err) => {
                          console.error("[EditOrder] Failed:", err);
                          alert("שגיאה בשמירה. נסה שוב.");
                        },
                      }
                    );
                  }}
                >
                  {updateFieldsMutation.isPending ? (
                    <span className="text-base animate-spin ml-2"><MaterialIcon name="progress_activity" /></span>
                  ) : null}
                  שמור
                </Button>
              </div>
              <div className="border-t border-border pt-3 w-full">
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <span className="text-base ml-2"><MaterialIcon name="delete" /></span>
                  מחק הזמנה
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation dialog */}
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader>
              <DialogTitle>מחיקת הזמנה</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              האם למחוק את ההזמנה של <strong>{order.productName}</strong> ({order.quantity} יח')?
              <br />
              <span className="text-destructive font-medium">פעולה זו לא ניתנת לביטול.</span>
            </p>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                ביטול
              </Button>
              <Button
                variant="destructive"
                disabled={deleteOrderMutation.isPending}
                onClick={() => {
                  deleteOrderMutation.mutate(
                    { rowIndex: order.rowIndex },
                    {
                      onSuccess: () => {
                        setShowDeleteConfirm(false);
                        setShowEditDialog(false);
                      },
                      onError: (err) => {
                        console.error("[DeleteOrder] Failed:", err);
                        alert("שגיאה במחיקה. נסה שוב.");
                      },
                    }
                  );
                }}
              >
                {deleteOrderMutation.isPending ? (
                  <span className="text-base animate-spin ml-2"><MaterialIcon name="progress_activity" /></span>
                ) : (
                  <span className="text-base ml-2"><MaterialIcon name="delete" /></span>
                )}
                מחק
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      {/* Arrived details section */}
      {showArrivedDetails && arrivedFlag && (
        <div className="mt-2 mr-6 border-t border-border/20 pt-2">
          <div className="bg-green-500/10 rounded-lg p-3 space-y-1.5 text-xs">
            <div className="font-medium text-sm text-green-400">
              זוהתה קפיצת מלאי
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-green-400"><MaterialIcon name="arrow_upward" /></span>
              <span>
                מלאי עלה מ-<strong>{arrivedFlag.oldStock}</strong> ל-<strong>{arrivedFlag.newStock}</strong> (<strong>+{arrivedFlag.jump}</strong>)
              </span>
            </div>
            <div>כמות בהזמנה: <strong>{arrivedFlag.orderQuantity}</strong></div>
            <div className="pt-1">
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={statusMutation.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  statusMutation.mutate(
                    { rowIndex: order.rowIndex, received: true },
                    { onSuccess: () => onRemoveArrivedFlag?.(order.rowIndex) }
                  );
                }}
              >
                {statusMutation.isPending ? (
                  <span className="text-sm animate-spin ml-1"><MaterialIcon name="progress_activity" /></span>
                ) : (
                  <span className="text-sm ml-1"><MaterialIcon name="check_circle" /></span>
                )}
                סמן כהתקבל
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Comment log section — timeline */}
      {showComments && (
        <div className="mt-3 mr-6 border-t border-border/20 pt-3">
          {commentEntries.length > 0 && (
            <div className="relative mr-2 mb-3">
              {/* Vertical timeline line */}
              <div className="absolute right-[5px] top-2 bottom-2 w-px bg-border/40" />
              <div className="space-y-3">
                {commentEntries.map((entry, i) => (
                  <div key={i} className="flex gap-3 items-start relative">
                    {/* Timeline dot */}
                    <div className="relative z-10 mt-1.5 shrink-0">
                      <div className="w-[11px] h-[11px] rounded-full bg-primary/80 border-2 border-background" />
                    </div>
                    <div className="min-w-0 flex-1">
                      {entry.date && (
                        <div className="text-[11px] font-bold text-muted-foreground mb-0.5">{entry.date}</div>
                      )}
                      <div className="text-sm text-foreground leading-relaxed">{entry.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddComment(); }}
              placeholder="הוסף הערה..."
              className="flex-1 text-xs border border-border/40 rounded-full px-3 py-1.5 bg-muted/30 focus:bg-background focus:border-primary/30 transition-colors"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 rounded-full hover:bg-primary/10"
              disabled={commentsMutation.isPending || !newComment.trim()}
              onClick={(e) => {
                e.stopPropagation();
                handleAddComment();
              }}
            >
              {commentsMutation.isPending ? (
                <span className="text-sm animate-spin"><MaterialIcon name="progress_activity" /></span>
              ) : (
                <span className="text-sm text-primary"><MaterialIcon name="send" /></span>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderGroupCard({ group, mode, skuNameMap, arrivedFlags, onRemoveArrivedFlag }: { group: OrderGroup; mode: GroupMode; skuNameMap: Map<string, string>; arrivedFlags: Record<number, ArrivedFlag>; onRemoveArrivedFlag: (rowIndex: number) => void }) {
  const iconName = mode === "date" ? "calendar_today" : "inventory_2";
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`px-6 md:px-8 py-5 transition-colors ${group.hasOverdue ? "bg-red-50/80" : "bg-white/90 hover:bg-white"}`}
    >
      {/* Header — always visible, tappable */}
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${group.hasOverdue ? "bg-destructive/10" : "bg-primary/10"}`}>
            <span className={`text-lg ${group.hasOverdue ? "text-destructive" : "text-primary"}`}><MaterialIcon name={iconName} /></span>
          </div>
          <div>
            <div className="font-bold text-base font-display">{group.label}</div>
            <div className="text-xs text-muted-foreground font-medium flex items-center gap-1 flex-wrap">
              <span className="text-xs"><MaterialIcon name="inventory_2" /></span>
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
        <div className="flex items-center gap-3">
          {group.hasOverdue && (
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-destructive"><MaterialIcon name="error" /></span>
              <span className="text-xs font-bold text-destructive">באיחור</span>
            </div>
          )}
          <span className={`text-lg text-muted-foreground transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}>
            <MaterialIcon name="expand_more" />
          </span>
        </div>
      </div>

      {/* Expandable order details */}
      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: expanded ? `${group.orders.length * 160 + 80}px` : "0px" }}
      >
        <div className="pt-3 mt-3 border-t border-white/5">
          {group.orders.map((order, idx) => (
            <OrderItem key={`${order.dermaSku}-${order.rowIndex}`} order={order} index={idx} mode={mode} expanded={expanded} skuNameMap={skuNameMap} arrivedFlag={arrivedFlags[order.rowIndex]} onRemoveArrivedFlag={onRemoveArrivedFlag} />
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
  const { arrivedFlags, removeArrivedFlag } = useArrivedFlags();

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
          <span className="text-lg text-primary"><MaterialIcon name="shopping_cart" /></span>
          <h2 className="text-lg font-bold">הזמנות פתוחות</h2>
          {!isLoading && orders && (
            <Badge variant="outline">{orders.length}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 p-1 rounded-lg bg-white/5">
            <button
              onClick={() => setGroupMode("date")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${groupMode === "date"
                ? "bg-card text-foreground shadow-sm ring-1 ring-white/10"
                : "text-muted-foreground hover:text-foreground hover:bg-white/10"
                }`}
            >
              <span className="text-sm"><MaterialIcon name="calendar_today" /></span>
              לפי תאריך
            </button>
            <button
              onClick={() => setGroupMode("product")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${groupMode === "product"
                ? "bg-card text-foreground shadow-sm ring-1 ring-white/10"
                : "text-muted-foreground hover:text-foreground hover:bg-white/10"
                }`}
            >
              <span className="text-sm"><MaterialIcon name="inventory_2" /></span>
              לפי מוצר
            </button>
          </div>
          <AddOrderDialog />
        </div>
      </div>

      {/* States */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <span className="text-2xl animate-spin text-muted-foreground"><MaterialIcon name="progress_activity" /></span>
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

      {/* Orders list */}
      {!isLoading && !error && groups.length > 0 && (
        <div className="bg-card rounded-3xl overflow-hidden border border-border">
          <div className="divide-y divide-border">
            {groups.map((group) => (
              <OrderGroupCard key={group.label} group={group} mode={groupMode} skuNameMap={skuNameMap} arrivedFlags={arrivedFlags} onRemoveArrivedFlag={removeArrivedFlag} />
            ))}
          </div>
        </div>
      )}

      {/* No injected hover styles needed — expansion is JS-driven */}
    </div>
  );
}
