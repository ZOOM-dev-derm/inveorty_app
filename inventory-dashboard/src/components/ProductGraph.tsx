import { useState, useCallback, useMemo, useEffect, useRef } from "react";
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
} from "recharts";
import { useProductForecast } from "@/hooks/useSheetData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AddOrderDialog } from "./AddOrderDialog";
import { TrendingDown, TrendingUp, Minus, Truck, AlertCircle, ShoppingCart, ZoomIn, ZoomOut, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";

interface ProductGraphProps {
  sku: string;
  productName: string;
  currentStock: number;
  onTheWay: number;
  onOrdersClick?: (productName: string) => void;
}

export function ProductGraph({ sku, productName, currentStock, onTheWay, onOrdersClick }: ProductGraphProps) {
  const { chartData, declineRate, minAmount, realRate, minRate, isLoading, error } = useProductForecast(sku, currentStock);

  const [zoomRange, setZoomRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const wheelThrottleRef = useRef<number | null>(null);
  const touchRef = useRef<{ startDist: number; startRange: { start: number; end: number }; lastX: number; fingers: number } | null>(null);

  // Reset zoom range when chartData changes
  useEffect(() => {
    if (chartData.length > 0) {
      setZoomRange({ start: 0, end: chartData.length - 1 });
    }
  }, [chartData.length]);

  const isZoomed = zoomRange.end - zoomRange.start < chartData.length - 1;

  const zoomIn = useCallback(() => {
    setZoomRange(prev => {
      const range = prev.end - prev.start;
      if (range < 3) return prev;
      const step = Math.max(1, Math.round(range * 0.15));
      return {
        start: Math.min(prev.end - 2, prev.start + step),
        end: Math.max(prev.start + 2, prev.end - step),
      };
    });
  }, []);

  const zoomOut = useCallback(() => {
    setZoomRange(prev => {
      const maxEnd = chartData.length - 1;
      const range = prev.end - prev.start;
      const step = Math.max(1, Math.round(range * 0.15));
      return {
        start: Math.max(0, prev.start - step),
        end: Math.min(maxEnd, prev.end + step),
      };
    });
  }, [chartData.length]);

  const resetZoom = useCallback(() => {
    setZoomRange({ start: 0, end: chartData.length - 1 });
  }, [chartData.length]);

  const panLeft = useCallback(() => {
    setZoomRange(prev => {
      const range = prev.end - prev.start;
      const step = Math.max(1, Math.round(range * 0.2));
      const newStart = Math.max(0, prev.start - step);
      return { start: newStart, end: newStart + range };
    });
  }, []);

  const panRight = useCallback(() => {
    setZoomRange(prev => {
      const maxEnd = chartData.length - 1;
      const range = prev.end - prev.start;
      const step = Math.max(1, Math.round(range * 0.2));
      const newEnd = Math.min(maxEnd, prev.end + step);
      return { start: newEnd - range, end: newEnd };
    });
  }, [chartData.length]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (wheelThrottleRef.current) return;
    wheelThrottleRef.current = window.setTimeout(() => { wheelThrottleRef.current = null; }, 50);

    const dataLen = chartData.length;
    if (dataLen < 3) return;

    setZoomRange(prev => {
      const range = prev.end - prev.start;
      const zoomDir = e.deltaY < 0 ? 1 : -1; // up = zoom in
      const step = Math.max(1, Math.round(range * 0.05));
      if (zoomDir > 0) {
        // Zoom in
        if (range < 3) return prev;
        return {
          start: Math.min(prev.end - 2, prev.start + step),
          end: Math.max(prev.start + 2, prev.end - step),
        };
      } else {
        // Zoom out
        return {
          start: Math.max(0, prev.start - step),
          end: Math.min(dataLen - 1, prev.end + step),
        };
      }
    });
  }, [chartData.length]);

  const getTouchDist = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Prevent browser native pinch-zoom
      e.preventDefault();
      touchRef.current = {
        startDist: getTouchDist(e.touches),
        startRange: { ...zoomRange },
        lastX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        fingers: 2,
      };
    } else if (e.touches.length === 1 && isZoomed) {
      touchRef.current = {
        startDist: 0,
        startRange: { ...zoomRange },
        lastX: e.touches[0].clientX,
        fingers: 1,
      };
    }
  }, [zoomRange, isZoomed]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const dataLen = chartData.length;
    if (dataLen < 3) return;

    if (touchRef.current.fingers === 2 && e.touches.length === 2) {
      // Pinch zoom
      e.preventDefault();
      const dist = getTouchDist(e.touches);
      const scale = dist / touchRef.current.startDist;
      const origRange = touchRef.current.startRange.end - touchRef.current.startRange.start;
      const newRange = Math.max(2, Math.min(dataLen - 1, Math.round(origRange / scale)));
      const center = Math.round((touchRef.current.startRange.start + touchRef.current.startRange.end) / 2);
      const half = Math.round(newRange / 2);
      let newStart = Math.max(0, center - half);
      let newEnd = newStart + newRange;
      if (newEnd > dataLen - 1) {
        newEnd = dataLen - 1;
        newStart = Math.max(0, newEnd - newRange);
      }
      setZoomRange({ start: newStart, end: newEnd });
    } else if (touchRef.current.fingers === 1 && e.touches.length === 1) {
      // Single-finger pan — use functional updater to avoid stale closure
      const deltaX = e.touches[0].clientX - touchRef.current.lastX;
      touchRef.current.lastX = e.touches[0].clientX;
      const step = Math.round(deltaX / 10);
      if (step !== 0) {
        setZoomRange(prev => {
          const range = prev.end - prev.start;
          const newStart = Math.max(0, Math.min(dataLen - 1 - range, prev.start - step));
          return { start: newStart, end: newStart + range };
        });
      }
    }
  }, [chartData.length]);

  const handleTouchEnd = useCallback(() => {
    touchRef.current = null;
  }, []);

  // Slice chart data to visible range
  const visibleData = useMemo(() => {
    if (chartData.length === 0) return chartData;
    return chartData.slice(zoomRange.start, zoomRange.end + 1);
  }, [chartData, zoomRange]);

  // Compute Y-axis domain so the minAmount reference line is always visible
  const yMax = useMemo(() => {
    if (!visibleData.length) return undefined;
    let max = 0;
    for (const p of visibleData) {
      if (p.quantity !== null && p.quantity !== undefined && p.quantity > max) max = p.quantity;
      if (p.forecast !== null && p.forecast !== undefined && p.forecast > max) max = p.forecast;
      if (p.onTheWay !== null && p.onTheWay !== undefined && p.onTheWay > max) max = p.onTheWay;
    }
    if (minAmount !== null && minAmount > max) max = minAmount;
    return max > 0 ? Math.ceil(max * 1.05) : undefined; // 5% padding
  }, [visibleData, minAmount]);

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
          <CardTitle className="text-base md:text-lg font-bold text-foreground leading-tight">{productName}</CardTitle>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-extrabold text-primary">{currentStock}</span>
            <span className="text-xs md:text-sm font-medium text-muted-foreground">יחידות במלאי</span>
          </div>
        </div>

        {/* SKU */}
        <div className="text-[10px] md:text-xs text-muted-foreground font-medium">
          מק״ט: {sku}
        </div>

        {/* Status Chips Row */}
        <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
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
                <Button variant="outline" size="sm" className="h-6 md:h-7 gap-1.5 text-[10px] md:text-xs px-2 md:px-2.5 border-primary/30 text-primary hover:bg-primary/5">
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
          <div className="text-[10px] md:text-[11px] pt-1">
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
        <div
          className="h-64 md:h-80 w-full relative touch-none"
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Zoom control buttons */}
          <div className="absolute top-1 left-1 md:top-2 md:left-2 z-10 flex items-center gap-0.5 md:gap-1 bg-background/80 backdrop-blur-sm rounded-lg border border-border/50 p-0.5 shadow-sm">
            <Button variant="ghost" size="icon" className="h-8 w-8 md:h-7 md:w-7" onClick={zoomIn} title="זום פנימה">
              <ZoomIn className="h-4 md:h-3.5 w-4 md:w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 md:h-7 md:w-7" onClick={zoomOut} title="זום החוצה">
              <ZoomOut className="h-4 md:h-3.5 w-4 md:w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 md:h-7 md:w-7" onClick={resetZoom} title="איפוס תצוגה" disabled={!isZoomed}>
              <RotateCcw className="h-4 md:h-3.5 w-4 md:w-3.5" />
            </Button>
            <div className="w-px h-4 bg-border/50" />
            <Button variant="ghost" size="icon" className="h-8 w-8 md:h-7 md:w-7" onClick={panLeft} title="הזז שמאלה" disabled={zoomRange.start === 0}>
              <ChevronLeft className="h-4 md:h-3.5 w-4 md:w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 md:h-7 md:w-7" onClick={panRight} title="הזז ימינה" disabled={zoomRange.end >= chartData.length - 1}>
              <ChevronRight className="h-4 md:h-3.5 w-4 md:w-3.5" />
            </Button>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={visibleData}
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
