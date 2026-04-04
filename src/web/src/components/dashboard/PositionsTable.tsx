import { usePositions } from "../../hooks/useApi.ts";

export function PositionsTable() {
  const { data: positions, isLoading } = usePositions();

  const count = positions?.length ?? 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-semibold" style={{ color: "#f1f5f9" }}>
          활성 포지션
        </h2>
        {count > 0 && (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium font-mono tabular-nums"
            style={{
              backgroundColor: "#052e16",
              color: "#22c55e",
            }}
          >
            {count}
          </span>
        )}
      </div>

      {/* Loading skeleton */}
      {isLoading && <TableSkeleton />}

      {/* Empty state */}
      {!isLoading && count === 0 && (
        <div
          className="rounded-lg border py-8 text-center text-sm"
          style={{
            backgroundColor: "#1e293b",
            borderColor: "#334155",
            color: "#64748b",
          }}
        >
          활성 포지션 없음
        </div>
      )}

      {/* Positions table */}
      {!isLoading && count > 0 && positions && (
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
                  현재가
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
                  미실현 PnL
                </th>
                <th scope="col" className="px-3 py-2 font-medium" style={{ color: "#94a3b8" }}>
                  청산 단계
                </th>
                <th scope="col" className="px-3 py-2 font-medium" style={{ color: "#94a3b8" }}>
                  SL 상태
                </th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => (
                <PositionRow key={pos.id} position={pos} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Position row                                                       */
/* ------------------------------------------------------------------ */

interface PositionRowProps {
  position: {
    id: string;
    symbol: string;
    exchange: string;
    side: "LONG" | "SHORT";
    entryPrice: string;
    currentPrice: string;
    size: string;
    unrealizedPnl: string;
    liquidationStage: string;
    slStatus: "registered" | "unregistered";
  };
}

function PositionRow({ position: pos }: PositionRowProps) {
  const pnlNum = Number(pos.unrealizedPnl);
  const isProfit = pnlNum >= 0;
  const pnlColor = isProfit ? "#22c55e" : "#ef4444";
  const pnlPrefix = isProfit ? "+" : "";

  const sideColor = pos.side === "LONG" ? "#22c55e" : "#ef4444";
  const sideBg = pos.side === "LONG" ? "#052e16" : "#450a0a";

  return (
    <tr
      className="border-b last:border-b-0 transition-colors hover:bg-card-hover"
      style={{ borderColor: "#334155" }}
    >
      <td className="px-3 py-2 font-medium" style={{ color: "#f1f5f9" }}>
        {pos.symbol}
      </td>
      <td className="px-3 py-2" style={{ color: "#94a3b8" }}>
        {pos.exchange}
      </td>
      <td className="px-3 py-2">
        <span
          className="rounded px-1.5 py-0.5 text-xs font-medium"
          style={{ backgroundColor: sideBg, color: sideColor }}
        >
          {pos.side}
        </span>
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: "#f1f5f9" }}>
        {formatNum(pos.entryPrice)}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: "#f1f5f9" }}>
        {formatNum(pos.currentPrice)}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: "#f1f5f9" }}>
        {pos.size}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: pnlColor }}>
        {pnlPrefix}
        {formatNum(pos.unrealizedPnl)} USDT
      </td>
      <td className="px-3 py-2" style={{ color: "#94a3b8" }}>
        {pos.liquidationStage}
      </td>
      <td className="px-3 py-2">
        {pos.slStatus === "registered" ? (
          <span style={{ color: "#22c55e" }}>등록됨</span>
        ) : (
          <span
            className="rounded px-1.5 py-0.5 text-xs font-medium"
            style={{ backgroundColor: "#450a0a", color: "#ef4444" }}
          >
            미등록
          </span>
        )}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton loading state                                             */
/* ------------------------------------------------------------------ */

function SkeletonTableRow() {
  return (
    <div
      className="flex gap-4 border-b px-3 py-3 last:border-b-0"
      style={{ borderColor: "#334155" }}
    >
      <div className="h-4 w-20 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
      <div className="h-4 w-16 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
      <div className="h-4 w-12 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
      <div className="h-4 w-24 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
      <div className="h-4 w-24 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
      <div className="h-4 w-16 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
      <div className="h-4 w-24 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
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
      <SkeletonTableRow />
      <SkeletonTableRow />
      <SkeletonTableRow />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatNum(value: string): string {
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}
