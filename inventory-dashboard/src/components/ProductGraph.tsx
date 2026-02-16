import { useState, useCallback, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
  Brush,
} from "recharts";
import { useProductForecast } from "@/hooks/useSheetData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AddOrderDialog } from "./AddOrderDialog";
import { TrendingDown, TrendingUp, Minus, Truck, AlertCircle, ShoppingCart } from "lucide-react";

interface ProductGraphProps {
  sku: string;
  productName: string;
  currentStock: number;
  onTheWay: number;
  onOrdersClick?: (productName: string) => void;
}

export function ProductGraph({ sku, productName, currentStock, onTheWay, onOrdersClick }: ProductGraphProps) {
  const { chartData, declineRate, minAmount, realRate, minRate, isLoading, error } = useProductForecast(sku, currentStock);

  const [brushRange, setBrushRange] = useState<{ startIndex: number; endIndex: number } | undefined>();

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const dataLen = chartData.length;
    if (dataLen < 3) return;
    const start = brushRange?.startIndex ?? 0;
    const end = brushRange?.endIndex ?? dataLen - 1;
    const zoomDir = e.deltaY < 0 ? 1 : -1; // up = zoom in
    const step = Math.max(1, Math.round((end - start) * 0.1));
    const newStart = Math.min(end - 2, Math.max(0, start + zoomDir * step));
    const newEnd = Math.max(newStart + 2, Math.min(dataLen - 1, end - zoomDir * step));
    setBrushRange({ startIndex: newStart, endIndex: newEnd });
  }, [chartData.length, brushRange]);

  // Compute Y-axis domain so the minAmount reference line is always visible
  const yMax = useMemo(() => {
    if (!chartData.length) return undefined;
    let max = 0;
    for (const p of chartData) {
      if (p.quantity !== null && p.quantity !== undefined && p.quantity > max) max = p.quantity;
      if (p.forecast !== null && p.forecast !== undefined && p.forecast > max) max = p.forecast;
      if (p.onTheWay !== null && p.onTheWay !== undefined && p.onTheWay > max) max = p.onTheWay;
    }
    if (minAmount !== null && minAmount > max) max = minAmount;
    return max > 0 ? Math.ceil(max * 1.05) : undefined; // 5% padding
  }, [chartData, minAmount]);

  const ratePerMonth = Math.round(declineRate * 30);
  const realRatePerMonth = Math.round(realRate * 30);
  const minRatePerMonth = Math.round(minRate * 30);
  const isDecline = declineRate < -0.1;
  const isGrowth = declineRate > 0.1;
  // Real decline is faster (more negative) than min-based rate
  const realFasterThanMin = minAmount !== null && realRate < minRate;

  // Find critical point — when stock drops to <= minAmount
  // When orders exist, use the onTheWay line and find where it drops below
  // minAmount AFTER the last order spike (the final descent)
  const criticalPoint = useMemo(() => {
    if (minAmount === null) return null;
    const hasOrders = chartData.some(p => p.onTheWay !== null);
    const forecastPoints = chartData.filter(p => p.quantity === null);

    if (!hasOrders) {
      // No orders — first forecast point that drops to <= minAmount
      const fp = forecastPoints.filter(
        p => p.forecast !== null && p.forecast !== undefined && p.forecast <= minAmount
      );
      return fp.length > 0 ? fp[0] : null;
    }

    // With orders: find the LAST point where onTheWay > minAmount,
    // then the critical point is the next one (the final descent below minAmount)
    let lastAboveIndex = -1;
    for (let i = 0; i < forecastPoints.length; i++) {
      const value = forecastPoints[i].onTheWay ?? forecastPoints[i].forecast;
      if (value !== null && value !== undefined && value > minAmount) {
        lastAboveIndex = i;
      }
    }

    // If stock never goes above minAmount even with orders, use first below point
    if (lastAboveIndex === -1) {
      const fp = forecastPoints.filter(p => {
        const value = p.onTheWay ?? p.forecast;
        return value !== null && value !== undefined && value <= minAmount;
      });
      return fp.length > 0 ? fp[0] : null;
    }

    // The critical point is the first point AFTER the last above-minAmount point
    // where onTheWay drops to <= minAmount
    for (let i = lastAboveIndex + 1; i < forecastPoints.length; i++) {
      const value = forecastPoints[i].onTheWay ?? forecastPoints[i].forecast;
      if (value !== null && value !== undefined && value <= minAmount) {
        return forecastPoints[i];
      }
    }
    return null;
  }, [chartData, minAmount]);

  if (isLoading) {
    return (
      <Card className="overflow-hidden shadow-sm border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold truncate">{productName}</CardTitle>
        </CardHeader>
        <CardContent className="h-48 flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground text-sm font-medium">טוען נתונים...</div>
        </CardContent>
      </Card>
    );
  }

  if (error || chartData.length === 0) {
    return (
      <Card className="overflow-hidden shadow-sm border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold truncate">{productName}</CardTitle>
        </CardHeader>
        <CardContent className="h-48 flex items-center justify-center">
          <div className="text-muted-foreground text-sm">אין מספיק נתוני היסטוריה</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden transition-all hover:shadow-lg hover:border-primary/30 border-border/60 shadow-sm">
      <CardHeader className="pb-3 space-y-2 bg-gradient-to-b from-muted/20 to-transparent">
        {/* Primary Info — Product Name + Current Stock */}
        <div className="space-y-1">
          <CardTitle className="text-lg font-bold text-foreground leading-tight">{productName}</CardTitle>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-primary">{currentStock}</span>
            <span className="text-sm font-medium text-muted-foreground">יחידות במלאי</span>
          </div>
        </div>

        {/* SKU */}
        <div className="text-xs text-muted-foreground font-medium">
          מק״ט: {sku}
        </div>

        {/* Status Chips Row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Rate Chip */}
          <span
            className={`status-chip ${isDecline ? "chip-decline" : isGrowth ? "chip-growth" : "chip-stable"}`}
            title={minAmount !== null
              ? `מינימום חודשי: הכמות המינימלית (${minAmount}) חלקי 6 חודשים`
              : "קצב שינוי חודשי מחושב מנתוני היסטוריה"}
          >
            {isDecline ? (
              <TrendingDown className="h-3 w-3" />
            ) : isGrowth ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            <span className="font-semibold">{Math.abs(ratePerMonth)}</span>/חודש
          </span>

          {/* Real Rate Chip */}
          <span
            className="status-chip chip-info"
            title="קצב בפועל: חושב מנתוני היסטוריה באמצעות רגרסיה לינארית"
          >
            <span className="font-semibold">{Math.abs(realRatePerMonth)}</span>/חודש בפועל
          </span>

          {/* On The Way Chip */}
          {onTheWay > 0 && (
            <span
              className="status-chip chip-ontheway"
              onClick={() => onOrdersClick?.(productName)}
            >
              <Truck className="h-3 w-3" />
              <span className="font-semibold">{onTheWay}</span> בדרך
            </span>
          )}

          {/* Critical Point Alert Chip */}
          {criticalPoint && (
            <span className="status-chip chip-alert">
              <AlertCircle className="h-3 w-3" />
              <span className="font-semibold">זמן להזמנה</span>
            </span>
          )}

          {/* Quick Order Button */}
          {criticalPoint && minAmount !== null && (
            <AddOrderDialog
              trigger={
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs px-2.5 border-primary/30 text-primary hover:bg-primary/5">
                  <ShoppingCart className="h-3 w-3" />
                  הזמן עכשיו
                </Button>
              }
              initialData={{
                productName,
                dermaSku: sku,
                quantity: String(minAmount),
                expectedDate: criticalPoint.date,
                currentStock,
                onTheWay,
              }}
            />
          )}
        </div>

        {/* Rate Comparison */}
        {minAmount !== null && (
          <div className="text-[11px] pt-1">
            <span className={realFasterThanMin ? "text-rose-700 font-medium" : "text-emerald-700 font-medium"}>
              {realFasterThanMin ? "⚠ " : "✓ "}
              קצב בפועל: {Math.abs(realRatePerMonth)}/חודש
              {" "}· מינימום: {Math.abs(minRatePerMonth)}/חודש
              {" "}· {realFasterThanMin ? "קצב בפועל מהיר מתחזית" : "קצב בפועל איטי מתחזית"}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0 pr-0">
        <div className="h-80 w-full cursor-grab active:cursor-grabbing" onWheel={handleWheel}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 15, right: 16, left: 0, bottom: 5 }}
            >
              <defs>
                <linearGradient id={`gradient-actual-${sku}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.55 0.13 200)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="oklch(0.55 0.13 200)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id={`gradient-forecast-${sku}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.65 0.15 30)" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="oklch(0.65 0.15 30)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id={`gradient-order-${sku}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.55 0.15 280)" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="oklch(0.55 0.15 280)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 30)" opacity={0.4} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fontFamily: "Heebo" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fontFamily: "Heebo" }}
                tickLine={false}
                axisLine={false}
                width={45}
                domain={yMax ? [0, yMax] : undefined}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid oklch(0.9 0.01 30)",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                  fontSize: "12px",
                  direction: "rtl",
                  fontFamily: "Heebo",
                }}
                formatter={(value: number | undefined, name: string | undefined) => {
                  const labels: Record<string, string> = {
                    quantity: "מלאי בפועל",
                    forecast: "תחזית",
                    onTheWay: "עם הזמנות בדרך",
                    minAmount: "כמות מינימום",
                  };
                  const label = name ? (labels[name] ?? name) : "";
                  return [value ?? 0, label];
                }}
              />
              <ReferenceLine
                y={15}
                stroke="oklch(0.62 0.19 25)"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: "מלאי נמוך", position: "insideTopRight", fontSize: 10, fill: "oklch(0.62 0.19 25)", fontFamily: "Heebo", fontWeight: 600 }}
              />
              {minAmount !== null && (
                <ReferenceLine
                  y={minAmount}
                  stroke="oklch(0.55 0.15 280)"
                  strokeDasharray="6 3"
                  strokeWidth={1.5}
                  label={{ value: "מינימום", position: "insideTopLeft", fontSize: 10, fill: "oklch(0.55 0.15 280)", fontFamily: "Heebo", fontWeight: 600 }}
                />
              )}
              {/* Critical Point Marker */}
              {criticalPoint && (
                <ReferenceDot
                  x={criticalPoint.date}
                  y={criticalPoint.onTheWay ?? criticalPoint.forecast ?? 0}
                  r={6}
                  fill="oklch(0.62 0.19 25)"
                  stroke="white"
                  strokeWidth={2}
                  label={{
                    value: "⚠ זמן להזמנה",
                    position: "top",
                    fontSize: 11,
                    fill: "oklch(0.55 0.18 25)",
                    fontFamily: "Heebo",
                    fontWeight: 700,
                    offset: 12,
                  }}
                />
              )}
              {/* Actual inventory — prominent solid line with dots */}
              <Area
                type="monotone"
                dataKey="quantity"
                stroke="oklch(0.55 0.13 200)"
                strokeWidth={2.5}
                fill={`url(#gradient-actual-${sku})`}
                connectNulls={false}
                dot={{ r: 3, fill: "oklch(0.55 0.13 200)", strokeWidth: 0 }}
                activeDot={{ r: 6, fill: "oklch(0.55 0.13 200)", stroke: "white", strokeWidth: 2 }}
              />
              {/* Forecast — softer dashed line, no dots */}
              <Area
                type="monotone"
                dataKey="forecast"
                stroke="oklch(0.65 0.15 30)"
                strokeWidth={2}
                strokeDasharray="6 3"
                fill={`url(#gradient-forecast-${sku})`}
                connectNulls={true}
                dot={false}
                activeDot={{ r: 5, fill: "oklch(0.65 0.15 30)", stroke: "white", strokeWidth: 2 }}
              />
              {/* On the way — subtle dashed line, no dots */}
              <Area
                type="monotone"
                dataKey="onTheWay"
                stroke="oklch(0.55 0.15 280)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fill={`url(#gradient-order-${sku})`}
                connectNulls={true}
                dot={false}
                activeDot={{ r: 5, fill: "oklch(0.55 0.15 280)", stroke: "white", strokeWidth: 2 }}
              />
              <Brush
                dataKey="date"
                height={28}
                stroke="oklch(0.45 0.1 340)"
                fill="oklch(0.955 0.008 30)"
                travellerWidth={8}
                startIndex={brushRange?.startIndex}
                endIndex={brushRange?.endIndex}
                onChange={(range) => setBrushRange(range as { startIndex: number; endIndex: number })}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {/* Legend */}
        <div className="flex items-center justify-center gap-5 pb-4 pt-2 text-xs text-muted-foreground font-medium">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 rounded-full" style={{ backgroundColor: "oklch(0.55 0.13 200)" }} />
            מלאי בפועל
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 rounded-full" style={{ backgroundColor: "oklch(0.65 0.15 30)" }} />
            תחזית
          </span>
          {onTheWay > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 rounded-full" style={{ backgroundColor: "oklch(0.55 0.15 280)" }} />
              עם הזמנות
            </span>
          )}
          {minAmount !== null && (
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 rounded-full" style={{ backgroundColor: "oklch(0.55 0.15 280)" }} />
              מינימום
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
