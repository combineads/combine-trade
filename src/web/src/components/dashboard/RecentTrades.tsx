import { Link } from "react-router";
import type { Event } from "../../hooks/useApi.ts";
import { useEventsRecent } from "../../hooks/useApi.ts";

export function RecentTrades() {
  const { data: events, isLoading } = useEventsRecent();

  if (isLoading) {
    return <RecentTradesSkeleton />;
  }

  const trades = (events ?? []).slice(0, 5);

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        backgroundColor: "#1e293b",
        borderColor: "#334155",
      }}
    >
      <h2 className="mb-3 text-sm font-medium" style={{ color: "#94a3b8" }}>
        최근 거래
      </h2>

      {trades.length === 0 ? (
        <p className="py-4 text-center text-sm" style={{ color: "#64748b" }}>
          아직 완료된 거래가 없습니다
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {trades.map((trade) => (
            <TradeItem key={trade.id} trade={trade} />
          ))}
        </ul>
      )}

      <div className="mt-3 border-t pt-3" style={{ borderColor: "#334155" }}>
        <Link
          to="/trades"
          className="text-sm transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: "#94a3b8" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "#17b862";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "#94a3b8";
          }}
        >
          전체 보기
        </Link>
      </div>
    </div>
  );
}

function TradeItem({ trade }: { trade: Event }) {
  const pnl = Number(trade.pnl);
  const isProfit = pnl >= 0;
  const pnlColor = isProfit ? "#22c55e" : "#ef4444";
  const pnlPrefix = isProfit ? "+" : "";

  const formattedPnl = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(pnl));

  const timeStr = formatRelativeTime(trade.time);

  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="shrink-0 font-mono tabular-nums" style={{ color: "#64748b" }}>
        {timeStr}
      </span>
      <span className="shrink-0 font-medium" style={{ color: "#f1f5f9" }}>
        {trade.symbol}
      </span>
      <span
        className="shrink-0 text-xs font-medium"
        style={{
          color: trade.side === "LONG" ? "#22c55e" : "#ef4444",
        }}
      >
        {trade.side}
      </span>
      <span className="ml-auto shrink-0 font-mono tabular-nums" style={{ color: pnlColor }}>
        {pnlPrefix}
        {formattedPnl} USDT
      </span>
    </li>
  );
}

function formatRelativeTime(isoTime: string): string {
  const date = new Date(isoTime);
  const now = new Date();

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  const timeFmt = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const timeFormatted = timeFmt.format(date);

  if (isToday) {
    return timeFormatted;
  }
  if (isYesterday) {
    return `어제 ${timeFormatted}`;
  }

  const dateFmt = new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
  return `${dateFmt.format(date)} ${timeFormatted}`;
}

function RecentTradesSkeleton() {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        backgroundColor: "#1e293b",
        borderColor: "#334155",
      }}
    >
      <h2 className="mb-3 text-sm font-medium" style={{ color: "#94a3b8" }}>
        최근 거래
      </h2>
      <div
        className="mb-2 h-4 animate-pulse rounded"
        style={{ backgroundColor: "#334155", width: "85%" }}
      />
      <div
        className="mb-2 h-4 animate-pulse rounded"
        style={{ backgroundColor: "#334155", width: "80%" }}
      />
      <div
        className="mb-2 h-4 animate-pulse rounded"
        style={{ backgroundColor: "#334155", width: "75%" }}
      />
      <div
        className="mb-2 h-4 animate-pulse rounded"
        style={{ backgroundColor: "#334155", width: "70%" }}
      />
      <div
        className="mb-2 h-4 animate-pulse rounded"
        style={{ backgroundColor: "#334155", width: "65%" }}
      />
    </div>
  );
}
