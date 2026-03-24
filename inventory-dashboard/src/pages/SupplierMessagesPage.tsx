import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useSupplierMessages,
  useOpenOrders,
  useLinkSupplierMessage,
} from "@/hooks/useSheetData";
import type { SupplierMessage, Order } from "@/types";
import { Link2, CheckCircle2, Clock, Loader2 } from "lucide-react";

export function SupplierMessagesPage() {
  const { data: messages, isLoading } = useSupplierMessages();
  const { data: openOrders } = useOpenOrders();
  const [tab, setTab] = useState<"pending" | "handled">("pending");

  const pending = messages?.filter((m) => m.handled !== "כן") ?? [];
  const handled = messages?.filter((m) => m.handled === "כן") ?? [];
  const shown = tab === "pending" ? pending : handled;

  return (
    <>
      <PageHeader
        title="הודעות ספק"
        badge={pending.length > 0 ? pending.length : undefined}
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={tab === "pending" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("pending")}
        >
          <Clock className="h-4 w-4 ml-1.5" />
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
          <CheckCircle2 className="h-4 w-4 ml-1.5" />
          טופלו
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin ml-2" />
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
    </>
  );
}

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
  const [selectedOrder, setSelectedOrder] = useState<string>("");

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
                className="bg-green-100 text-green-800 text-xs shrink-0"
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
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4 ml-1" />
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
        </div>
      </CardContent>
    </Card>
  );
}
