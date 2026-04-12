import { useMemo, useState } from "react";
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
  useSupplierEmailHistory,
  useOpenOrders,
  useLinkSupplierMessage,
  useSendFollowUp,
  useSendFreeEmail,
  useUpdateOrderComments,
} from "@/hooks/useSheetData";
import type { SupplierMessage, SupplierEmail, Order, EmailThread } from "@/types";
import { MaterialIcon } from "@/components/ui/MaterialIcon";

type Tab = "history" | "pending" | "handled";
type ViewMode = "threads" | "byOrder";

// ── Helpers ──

function buildThreads(emails: SupplierEmail[]): EmailThread[] {
  const map = new Map<string, SupplierEmail[]>();
  for (const email of emails) {
    const key = email.threadId || email.id;
    const list = map.get(key) ?? [];
    list.push(email);
    map.set(key, list);
  }

  const threads: EmailThread[] = [];
  for (const [threadId, threadEmails] of map) {
    threadEmails.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const first = threadEmails[0];
    const last = threadEmails[threadEmails.length - 1];
    const orderTag = threadEmails.find((e) => e.orderTag)?.orderTag ?? null;

    let subject = first.subject;
    if (orderTag) subject = subject.replace(orderTag, "").trim();
    subject = subject.replace(/^(Re|Fwd|fw|השב|העבר):\s*/i, "").trim();

    threads.push({
      threadId,
      emails: threadEmails,
      subject: subject || "(ללא נושא)",
      latestDate: last.date,
      messageCount: threadEmails.length,
      orderTag,
      hasIncoming: threadEmails.some((e) => e.direction === "incoming"),
      hasOutgoing: threadEmails.some((e) => e.direction === "outgoing"),
      latestDirection: last.direction,
      latestBody: last.body,
    });
  }

  threads.sort(
    (a, b) =>
      new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime()
  );
  return threads;
}

function formatDate(isoDate: string): string {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}/${d.getFullYear()} ${d
    .getHours()
    .toString()
    .padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function formatShortDate(isoDate: string): string {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}`;
}

function isSameDay(date1: string, date2: string): boolean {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

// ── Main Page ──

export function SupplierMessagesPage() {
  const { data: messages, isLoading: msgsLoading } = useSupplierMessages();
  const { data: emailHistory, isLoading: emailsLoading } =
    useSupplierEmailHistory();
  const { data: openOrders } = useOpenOrders();
  const [tab, setTab] = useState<Tab>("history");
  const [supplierFilter, setSupplierFilter] = useState("פאר פארם");
  const [showComposeDialog, setShowComposeDialog] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("threads");

  const pending = messages?.filter((m) => m.handled !== "כן") ?? [];
  const handled = messages?.filter((m) => m.handled === "כן") ?? [];

  const isLoading = tab === "history" ? emailsLoading : msgsLoading;

  return (
    <>
      <PageHeader
        title="הודעות ספק"
        badge={pending.length > 0 ? pending.length : undefined}
        actions={
          <>
            <Select
              value={supplierFilter}
              onValueChange={setSupplierFilter}
              dir="rtl"
            >
              <SelectTrigger className="w-[140px]" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="הכל">הכל</SelectItem>
                <SelectItem value="פאר פארם">פאר פארם</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setShowComposeDialog(true)}>
              <span className="text-base ml-1">
                <MaterialIcon name="edit" />
              </span>
              הודעה חדשה
            </Button>
          </>
        }
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <Button
          variant={tab === "history" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("history")}
        >
          <span className="text-base ml-1.5">
            <MaterialIcon name="forum" />
          </span>
          כל ההודעות
        </Button>
        <Button
          variant={tab === "pending" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("pending")}
        >
          <span className="text-base ml-1.5">
            <MaterialIcon name="schedule" />
          </span>
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
          <span className="text-base ml-1.5">
            <MaterialIcon name="check_circle" />
          </span>
          טופלו
        </Button>
      </div>

      {/* View mode toggle for history tab */}
      {tab === "history" && (
        <div className="flex gap-2 mb-4">
          <Button
            variant={viewMode === "threads" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setViewMode("threads")}
          >
            <span className="text-sm ml-1">
              <MaterialIcon name="forum" />
            </span>
            שיחות
          </Button>
          <Button
            variant={viewMode === "byOrder" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setViewMode("byOrder")}
          >
            <span className="text-sm ml-1">
              <MaterialIcon name="inventory_2" />
            </span>
            לפי הזמנה
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <span className="text-lg animate-spin ml-2">
            <MaterialIcon name="progress_activity" />
          </span>
          טוען הודעות...
        </div>
      )}

      {/* Email history tab */}
      {tab === "history" && !emailsLoading && (
        <EmailHistoryView emails={emailHistory ?? []} viewMode={viewMode} />
      )}

      {/* Pending/handled tabs */}
      {tab !== "history" && !msgsLoading && (
        <>
          {(tab === "pending" ? pending : handled).length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {tab === "pending"
                ? "אין הודעות ממתינות"
                : "אין הודעות שטופלו"}
            </div>
          )}
          <div className="space-y-3">
            {(tab === "pending" ? pending : handled).map((msg) => (
              <MessageCard
                key={`${msg.rowIndex}-${msg.supplierSku}`}
                message={msg}
                openOrders={openOrders ?? []}
                isPending={tab === "pending"}
              />
            ))}
          </div>
        </>
      )}

      <ComposeDialog
        open={showComposeDialog}
        onOpenChange={setShowComposeDialog}
        openOrders={openOrders ?? []}
      />
    </>
  );
}

// ── Email History View ──

function EmailHistoryView({
  emails,
  viewMode,
}: {
  emails: SupplierEmail[];
  viewMode: ViewMode;
}) {
  if (emails.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        אין הודעות מהספק
      </div>
    );
  }

  if (viewMode === "threads") {
    return <ThreadedView emails={emails} />;
  }

  return <GroupedByOrderView emails={emails} />;
}

// ── Threaded View ──

function ThreadedView({ emails }: { emails: SupplierEmail[] }) {
  const threads = useMemo(() => buildThreads(emails), [emails]);
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);

  const toggleThread = (threadId: string) => {
    setExpandedThreadId((prev) => (prev === threadId ? null : threadId));
  };

  return (
    <div className="space-y-3">
      {threads.map((thread) => (
        <ThreadCard
          key={thread.threadId}
          thread={thread}
          expanded={expandedThreadId === thread.threadId}
          onToggle={() => toggleThread(thread.threadId)}
        />
      ))}
    </div>
  );
}

// ── Thread Card ──

function ThreadCard({
  thread,
  expanded,
  onToggle,
}: {
  thread: EmailThread;
  expanded: boolean;
  onToggle: () => void;
}) {
  const dateDisplay = useMemo(() => {
    if (thread.messageCount === 1) {
      return formatDate(thread.latestDate);
    }
    const first = thread.emails[0];
    const last = thread.emails[thread.emails.length - 1];
    return `${formatShortDate(first.date)} - ${formatShortDate(last.date)}`;
  }, [thread.messageCount, thread.latestDate, thread.emails]);

  return (
    <Card className="overflow-hidden">
      <div
        className="cursor-pointer hover:bg-accent/50 transition-colors py-3 px-4"
        onClick={onToggle}
      >
        <div className="flex flex-col gap-2">
          {/* Top row: direction dots + subject + date + chevron */}
          <div className="flex items-center gap-2">
            <div className="flex gap-1 shrink-0">
              {thread.hasIncoming && (
                <span
                  className="w-2 h-2 rounded-full bg-green-400"
                  title="התקבל"
                />
              )}
              {thread.hasOutgoing && (
                <span
                  className="w-2 h-2 rounded-full bg-blue-400"
                  title="נשלח"
                />
              )}
            </div>

            <span className="text-sm font-medium leading-snug flex-1 min-w-0 truncate">
              {thread.subject}
            </span>

            <span className="text-xs text-muted-foreground shrink-0">
              {dateDisplay}
            </span>

            <span
              className={`text-sm text-muted-foreground transition-transform duration-300 ${
                expanded ? "rotate-180" : ""
              }`}
            >
              <MaterialIcon name="expand_more" />
            </span>
          </div>

          {/* Second row: tags + count + preview */}
          <div className="flex items-center gap-2">
            {thread.orderTag && (
              <Badge variant="outline" className="text-[10px] shrink-0">
                {thread.orderTag}
              </Badge>
            )}
            {thread.messageCount > 1 && (
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {thread.messageCount} הודעות
              </Badge>
            )}
            {!expanded && thread.latestBody && (
              <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                {thread.latestBody.slice(0, 120)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded conversation */}
      {expanded && <ThreadConversation emails={thread.emails} />}
    </Card>
  );
}

// ── Thread Conversation ──

function ThreadConversation({ emails }: { emails: SupplierEmail[] }) {
  return (
    <div className="border-t border-border/30 px-4 py-3 space-y-2">
      {emails.map((email, idx) => (
        <div key={email.id}>
          {idx > 0 && !isSameDay(emails[idx - 1].date, email.date) && (
            <DateSeparator date={email.date} />
          )}
          <ThreadBubble email={email} />
        </div>
      ))}
    </div>
  );
}

// ── Thread Bubble ──

function ThreadBubble({ email }: { email: SupplierEmail }) {
  const isIncoming = email.direction === "incoming";

  return (
    <div
      className={`rounded-lg py-2 px-3 border-r-[3px] ${
        isIncoming
          ? "border-r-green-400 bg-green-500/5"
          : "border-r-blue-400 bg-blue-500/5"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Badge
          variant="secondary"
          className={`text-[10px] shrink-0 ${
            isIncoming
              ? "bg-green-500/10 text-green-400"
              : "bg-blue-500/10 text-blue-400"
          }`}
        >
          {isIncoming ? "התקבל" : "נשלח"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {formatDate(email.date)}
        </span>
      </div>
      {email.body && (
        <div className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {email.body}
        </div>
      )}
    </div>
  );
}

// ── Date Separator ──

function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 border-t border-border/30" />
      <span className="text-[10px] text-muted-foreground">
        {formatShortDate(date)}
      </span>
      <div className="flex-1 border-t border-border/30" />
    </div>
  );
}

// ── Grouped By Order View (with threads) ──

function GroupedByOrderView({ emails }: { emails: SupplierEmail[] }) {
  const groupsWithThreads = useMemo(() => {
    const map = new Map<string, SupplierEmail[]>();
    for (const email of emails) {
      const key = email.orderTag || "כללי";
      const list = map.get(key) ?? [];
      list.push(email);
      map.set(key, list);
    }
    const entries = Array.from(map.entries()).sort((a, b) => {
      if (a[0] === "כללי") return 1;
      if (b[0] === "כללי") return -1;
      return a[0].localeCompare(b[0]);
    });
    return entries.map(([tag, tagEmails]) => ({
      tag,
      emailCount: tagEmails.length,
      threads: buildThreads(tagEmails),
    }));
  }, [emails]);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(groupsWithThreads.map((g) => g.tag))
  );

  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleThread = (threadId: string) => {
    setExpandedThreadId((prev) => (prev === threadId ? null : threadId));
  };

  return (
    <div className="space-y-4">
      {groupsWithThreads.map(({ tag, emailCount, threads }) => (
        <div key={tag}>
          <button
            className="flex items-center gap-2 mb-2 w-full text-right"
            onClick={() => toggleGroup(tag)}
          >
            <span className="text-sm text-muted-foreground">
              <MaterialIcon
                name={
                  expandedGroups.has(tag) ? "expand_more" : "chevron_left"
                }
              />
            </span>
            <Badge variant="outline" className="text-xs">
              {tag}
            </Badge>
            <span className="text-xs text-muted-foreground">
              ({emailCount})
            </span>
          </button>
          {expandedGroups.has(tag) && (
            <div className="space-y-2 pr-4">
              {threads.map((thread) => (
                <ThreadCard
                  key={thread.threadId}
                  thread={thread}
                  expanded={expandedThreadId === thread.threadId}
                  onToggle={() => toggleThread(thread.threadId)}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
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

// ── Sheet Message Card (pending/handled) ──

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
  const [showNoteSection, setShowNoteSection] = useState(false);
  const [noteOrderId, setNoteOrderId] = useState<string>(message.linkedOrder || "");
  const [noteText, setNoteText] = useState("");

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
    commentsMutation.mutate(
      { rowIndex: orderRowIndex, comment: `${dateStr}: [ספק] ${noteText.trim()}` },
      {
        onSuccess: () => { setNoteText(""); setShowNoteSection(false); },
        onError: (err) => { console.error("[Note] Failed:", err); alert("שגיאה בשמירת ההערה. נסה שוב."); },
      }
    );
  };

  return (
    <Card>
      <CardContent className="py-4 px-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs shrink-0">{message.date}</Badge>
                {message.subject && (
                  <span className="text-sm text-muted-foreground truncate">{message.subject}</span>
                )}
              </div>
            </div>
            {!isPending && (
              <Badge variant="secondary" className="bg-green-500/10 text-green-400 text-xs shrink-0">טופל</Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span><span className="font-medium">מק״ט:</span> {message.supplierSku}</span>
            <span><span className="font-medium">סטטוס:</span> <span className="text-primary font-medium">{message.status}</span></span>
            {message.quantity && <span><span className="font-medium">כמות:</span> {message.quantity}</span>}
            {message.expectedDate && <span><span className="font-medium">צפי:</span> {message.expectedDate}</span>}
          </div>

          {isPending && (
            <div className="flex items-center gap-2 pt-1">
              {matchingOrders.length > 0 ? (
                <>
                  <Select value={selectedOrder} onValueChange={setSelectedOrder} dir="rtl">
                    <SelectTrigger className="flex-1 min-w-[200px]" size="sm">
                      <SelectValue placeholder="בחר הזמנה לשיוך..." />
                    </SelectTrigger>
                    <SelectContent>
                      {matchingOrders.map((order) => (
                        <SelectItem key={order.rowIndex} value={order.rowIndex.toString()}>
                          {order.productName} — {order.quantity} יח' — {order.orderDate}
                          {order.dermaSku ? ` (${order.dermaSku})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={handleLink} disabled={!selectedOrder || linkMutation.isPending}>
                    {linkMutation.isPending ? (
                      <span className="text-base animate-spin"><MaterialIcon name="progress_activity" /></span>
                    ) : (
                      <span className="text-base ml-1"><MaterialIcon name="link" /></span>
                    )}
                    שייך
                  </Button>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">לא נמצאו הזמנות פתוחות למק״ט {message.supplierSku}</span>
              )}
            </div>
          )}

          {!isPending && message.linkedOrder && (
            <div className="text-xs text-muted-foreground">שויך לשורה {message.linkedOrder}</div>
          )}

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
                    <SelectItem key={order.rowIndex} value={order.rowIndex.toString()}>
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
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddNote(); }}
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
