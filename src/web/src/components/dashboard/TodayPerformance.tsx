import { useStats } from "../../hooks/useApi.ts";

export function TodayPerformance() {
  const { data: stats, isLoading } = useStats();

  if (isLoading) {
    return <TodayPerformanceSkeleton />;
  }

  const pnl = Number(stats?.todayPnl ?? 0);
  const trades = stats?.todayTrades ?? 0;
  const winRate = stats?.winRate ?? 0;

  const isProfit = pnl >= 0;
  const pnlColor = isProfit ? "#22c55e" : "#ef4444";
  const pnlPrefix = isProfit ? "+" : "";

  const formattedPnl = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(pnl));

  const formattedWinRate = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(winRate);

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        backgroundColor: "#1e293b",
        borderColor: "#334155",
      }}
    >
      <h2 className="mb-3 text-sm font-medium" style={{ color: "#94a3b8" }}>
        오늘의 성과
      </h2>

      <p
        className="font-mono tabular-nums"
        style={{
          color: pnlColor,
          fontSize: "36px",
          lineHeight: 1.2,
        }}
      >
        {pnlPrefix}
        {formattedPnl} USDT
      </p>

      <div className="mt-2 flex items-center gap-3 text-sm" style={{ color: "#94a3b8" }}>
        <span>
          거래 <span className="font-mono tabular-nums">{trades}</span>건
        </span>
        <span>
          승률 <span className="font-mono tabular-nums">{formattedWinRate}%</span>
        </span>
      </div>
    </div>
  );
}

function TodayPerformanceSkeleton() {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        backgroundColor: "#1e293b",
        borderColor: "#334155",
      }}
    >
      <h2 className="mb-3 text-sm font-medium" style={{ color: "#94a3b8" }}>
        오늘의 성과
      </h2>
      <div className="h-10 w-48 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
      <div className="mt-2 h-4 w-32 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
    </div>
  );
}
