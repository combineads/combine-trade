import type { Ticket } from "../../hooks/useApi.ts";

const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const numberFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const RESULT_LABELS: Record<string, string> = {
  WIN: "수익",
  LOSS: "손실",
  TIMEOUT: "시간 청산",
};

interface TradesTableProps {
  tickets: Ticket[];
  total: number;
  isLoading: boolean;
}

export function TradesTable({ tickets, total, isLoading }: TradesTableProps) {
  if (isLoading) {
    return <TableSkeleton />;
  }

  if (tickets.length === 0) {
    return (
      <div
        className="rounded-lg border py-12 text-center text-sm"
        style={{
          backgroundColor: "#1e293b",
          borderColor: "#334155",
          color: "#64748b",
        }}
      >
        조건에 맞는 거래 내역이 없습니다
      </div>
    );
  }

  return (
    <div>
      <div
        className="overflow-x-auto rounded-lg border"
        style={{
          backgroundColor: "#1e293b",
          borderColor: "#334155",
        }}
      >
        <table className="w-full text-left text-sm">
          <thead>
            <tr style={{ borderColor: "#334155" }} className="border-b">
              <th scope="col" className="px-3 py-2 font-medium" style={{ color: "#94a3b8" }}>
                시간
              </th>
              <th scope="col" className="px-3 py-2 font-medium" style={{ color: "#94a3b8" }}>
                심볼
              </th>
              <th scope="col" className="px-3 py-2 font-medium" style={{ color: "#94a3b8" }}>
                거래소
              </th>
              <th scope="col" className="px-3 py-2 font-medium" style={{ color: "#94a3b8" }}>
                방향
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-right font-medium"
                style={{ color: "#94a3b8" }}
              >
                진입가
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-right font-medium"
                style={{ color: "#94a3b8" }}
              >
                청산가
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-right font-medium"
                style={{ color: "#94a3b8" }}
              >
                수량
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-right font-medium"
                style={{ color: "#94a3b8" }}
              >
                실현 PnL
              </th>
              <th scope="col" className="px-3 py-2 font-medium" style={{ color: "#94a3b8" }}>
                결과
              </th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Total count */}
      <div className="mt-3 text-sm" style={{ color: "#94a3b8" }}>
        총{" "}
        <span className="font-mono tabular-nums" style={{ color: "#f1f5f9" }}>
          {total}
        </span>
        건
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Ticket row                                                         */
/* ------------------------------------------------------------------ */

function TicketRow({ ticket }: { ticket: Ticket }) {
  const pnlNum = Number(ticket.realizedPnl);
  const isProfit = pnlNum >= 0;
  const pnlColor = isProfit ? "#22c55e" : "#ef4444";
  const pnlPrefix = isProfit ? "+" : "";

  const sideColor = ticket.side === "LONG" ? "#22c55e" : "#ef4444";
  const sideBg = ticket.side === "LONG" ? "#052e16" : "#450a0a";

  const resultLabel = RESULT_LABELS[ticket.result] ?? ticket.result;
  const resultColor =
    ticket.result === "WIN" ? "#22c55e" : ticket.result === "LOSS" ? "#ef4444" : "#94a3b8";

  const exchangeLabel = ticket.exchange === "binance" ? "바이낸스" : ticket.exchange;

  return (
    <tr
      className="border-b transition-colors last:border-b-0"
      style={{ borderColor: "#334155" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "#263248";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "";
      }}
    >
      <td
        className="whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums"
        style={{ color: "#94a3b8" }}
      >
        {dateFmt.format(new Date(ticket.time))}
      </td>
      <td className="px-3 py-2 font-medium" style={{ color: "#f1f5f9" }}>
        {ticket.symbol}
      </td>
      <td className="px-3 py-2" style={{ color: "#94a3b8" }}>
        {exchangeLabel}
      </td>
      <td className="px-3 py-2">
        <span
          className="rounded px-1.5 py-0.5 text-xs font-medium"
          style={{ backgroundColor: sideBg, color: sideColor }}
        >
          {ticket.side}
        </span>
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: "#f1f5f9" }}>
        {numberFmt.format(Number(ticket.entryPrice))}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: "#f1f5f9" }}>
        {numberFmt.format(Number(ticket.exitPrice))}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: "#f1f5f9" }}>
        {ticket.size}
      </td>
      <td
        className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums"
        style={{ color: pnlColor }}
      >
        {pnlPrefix}
        {numberFmt.format(Math.abs(pnlNum))} USDT
      </td>
      <td className="px-3 py-2 text-sm font-medium" style={{ color: resultColor }}>
        {resultLabel}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton loading state                                             */
/* ------------------------------------------------------------------ */

function SkeletonRow() {
  return (
    <div
      className="flex items-center gap-4 border-b px-3 py-3 last:border-b-0"
      style={{ borderColor: "#334155" }}
    >
      <div className="h-4 w-20 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
      <div className="h-4 w-18 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
      <div className="h-4 w-16 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
      <div className="h-4 w-12 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
      <div className="h-4 w-24 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
      <div className="h-4 w-24 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
      <div className="h-4 w-12 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
      <div className="h-4 w-24 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
      <div className="h-4 w-12 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{
        backgroundColor: "#1e293b",
        borderColor: "#334155",
      }}
    >
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </div>
  );
}
