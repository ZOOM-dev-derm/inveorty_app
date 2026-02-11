import { useState, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
} from "recharts";
import { useProductForecast } from "@/hooks/useSheetData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, TrendingUp, Minus, Truck } from "lucide-react";

interface ProductGraphProps {
  sku: string;
  productName: string;
  currentStock: number;
  onTheWay: number;
}

export function ProductGraph({ sku, productName, currentStock, onTheWay }: ProductGraphProps) {
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

  const ratePerMonth = Math.round(declineRate * 30);
  const realRatePerMonth = Math.round(realRate * 30);
  const minRatePerMonth = Math.round(minRate * 30);
  const isDecline = declineRate < -0.1;
  const isGrowth = declineRate > 0.1;
  // Real decline is faster (more negative) than min-based rate
  const realFasterThanMin = minAmount !== null && realRate < minRate;

  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium truncate">{productName}</CardTitle>
        </CardHeader>
        <CardContent className="h-48 flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground text-sm">טוען נתונים...</div>
        </CardContent>
      </Card>
    );
  }

  if (error || chartData.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium truncate">{productName}</CardTitle>
        </CardHeader>
        <CardContent className="h-48 flex items-center justify-center">
          <div className="text-muted-foreground text-sm">אין מספיק נתוני היסטוריה</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-lg">
      <CardHeader className="pb-2 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold truncate flex-1">{productName}</CardTitle>
          <div className="flex items-center gap-1.5 shrink-0">
            {onTheWay > 0 && (
              <Badge variant="outline" className="text-xs gap-1 bg-blue-50 text-blue-700 border-blue-200">
                <Truck className="h-3 w-3" />
                {onTheWay} בדרך
              </Badge>
            )}
            <Badge
              variant={isDecline ? "destructive" : isGrowth ? "default" : "secondary"}
              className="text-xs gap-1"
            >
              {isDecline ? (
                <TrendingDown className="h-3 w-3" />
              ) : isGrowth ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <Minus className="h-3 w-3" />
              )}
              {Math.abs(ratePerMonth)}/חודש
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>מלאי נוכחי: <strong className="text-foreground">{currentStock}</strong></span>
          <span className="text-muted-foreground/50">|</span>
          <span>מק״ט: {sku}</span>
        </div>
        {minAmount !== null && (
          <div className="flex items-center gap-2 text-xs">
            <span className={realFasterThanMin ? "text-red-600" : "text-green-600"}>
              קצב ירידה: {Math.abs(realRatePerMonth)}/חודש
              {" "}(מינימום: {Math.abs(minRatePerMonth)}/חודש)
            </span>
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 ${realFasterThanMin ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700 border-green-200"}`}
            >
              {realFasterThanMin ? "מהיר מהמינימום" : "איטי מהמינימום"}
            </Badge>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0 pr-0">
        <div className="h-80 w-full cursor-grab active:cursor-grabbing" onWheel={handleWheel}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 16, left: 0, bottom: 5 }}
            >
              <defs>
                <linearGradient id={`gradient-actual-${sku}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.6 0.118 184.704)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="oklch(0.6 0.118 184.704)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id={`gradient-forecast-${sku}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.646 0.222 41.116)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="oklch(0.646 0.222 41.116)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id={`gradient-order-${sku}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.623 0.214 259.815)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="oklch(0.623 0.214 259.815)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={35}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid oklch(0.922 0 0)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  fontSize: "12px",
                  direction: "rtl",
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
                stroke="oklch(0.577 0.245 27.325)"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: "מלאי נמוך", position: "insideTopRight", fontSize: 10, fill: "oklch(0.577 0.245 27.325)" }}
              />
              {minAmount !== null && (
                <ReferenceLine
                  y={minAmount}
                  stroke="oklch(0.55 0.2 280)"
                  strokeDasharray="6 3"
                  strokeWidth={1.5}
                  label={{ value: "מינימום", position: "insideTopLeft", fontSize: 10, fill: "oklch(0.55 0.2 280)" }}
                />
              )}
              {/* Actual inventory */}
              <Area
                type="monotone"
                dataKey="quantity"
                stroke="oklch(0.6 0.118 184.704)"
                strokeWidth={2.5}
                fill={`url(#gradient-actual-${sku})`}
                connectNulls={false}
                dot={{ r: 3, fill: "oklch(0.6 0.118 184.704)" }}
                activeDot={{ r: 5 }}
              />
              {/* Forecast */}
              <Area
                type="monotone"
                dataKey="forecast"
                stroke="oklch(0.646 0.222 41.116)"
                strokeWidth={2}
                strokeDasharray="6 3"
                fill={`url(#gradient-forecast-${sku})`}
                connectNulls={true}
                dot={{ r: 2, fill: "oklch(0.646 0.222 41.116)" }}
              />
              {/* On the way (forecast + orders) */}
              <Area
                type="monotone"
                dataKey="onTheWay"
                stroke="oklch(0.623 0.214 259.815)"
                strokeWidth={2}
                strokeDasharray="4 4"
                fill={`url(#gradient-order-${sku})`}
                connectNulls={true}
                dot={{ r: 2, fill: "oklch(0.623 0.214 259.815)" }}
              />
              <Brush
                dataKey="date"
                height={30}
                stroke="oklch(0.7 0.05 260)"
                fill="oklch(0.97 0.005 260)"
                travellerWidth={8}
                startIndex={brushRange?.startIndex}
                endIndex={brushRange?.endIndex}
                onChange={(range) => setBrushRange(range as { startIndex: number; endIndex: number })}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {/* Legend */}
        <div className="flex items-center justify-center gap-4 pb-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 rounded" style={{ backgroundColor: "oklch(0.6 0.118 184.704)" }} />
            מלאי בפועל
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 rounded border-dashed" style={{ backgroundColor: "oklch(0.646 0.222 41.116)" }} />
            תחזית
          </span>
          {onTheWay > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 rounded" style={{ backgroundColor: "oklch(0.623 0.214 259.815)" }} />
              עם הזמנות
            </span>
          )}
          {minAmount !== null && (
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 rounded border-dashed" style={{ backgroundColor: "oklch(0.55 0.2 280)" }} />
              מינימום
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
