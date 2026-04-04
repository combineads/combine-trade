import { useTradeStats } from "../../hooks/useApi.ts";

const PERIOD_LABELS: Record<string, string> = {
  today: "오늘",
  "7d": "최근 7일",
  "30d": "최근 30일",
  all: "전체",
};

const numberFmt = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

interface PerformanceSummaryProps {
  period: string;
}

export function PerformanceSummary({ period }: PerformanceSummaryProps) {
  const { data: stats, isLoading } = useTradeStats(period);

  const periodLabel = PERIOD_LABELS[period] ?? period;

  if (isLoading || !stats) {
    return <SummarySkeleton periodLabel={periodLabel} />;
  }

  const pnlNum = Number(stats.totalPnl);
  const pnlColor = pnlNum >= 0 ? "#22c55e" : "#ef4444";
  const pnlPrefix = pnlNum >= 0 ? "+" : "";

  const winRateColor = stats.winRate >= 50 ? "#22c55e" : "#ef4444";

  return (
    <section aria-label="성과 요약">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard title="총 수익" sub={periodLabel}>
          <span
            className="text-lg font-semibold font-mono tabular-nums sm:text-xl lg:text-2xl"
            style={{ color: pnlColor }}
          >
            {pnlPrefix}
            {numberFmt.format(pnlNum)} USDT
          </span>
        </SummaryCard>

        <SummaryCard title="총 거래" sub={periodLabel}>
          <span
            className="text-lg font-semibold font-mono tabular-nums sm:text-xl lg:text-2xl"
            style={{ color: "#f1f5f9" }}
          >
            {stats.totalTrades}건
          </span>
        </SummaryCard>

        <SummaryCard title="승률" sub={periodLabel}>
          <span
            className="text-lg font-semibold font-mono tabular-nums sm:text-xl lg:text-2xl"
            style={{ color: winRateColor }}
          >
            {stats.winRate.toFixed(1)}%
          </span>
        </SummaryCard>

        <SummaryCard title="평균 손익비" sub={periodLabel}>
          <span
            className="text-lg font-semibold font-mono tabular-nums sm:text-xl lg:text-2xl"
            style={{ color: "#f1f5f9" }}
          >
            1:{stats.avgRiskReward}
          </span>
        </SummaryCard>

        <SummaryCard title="최대 낙폭(MDD)" sub={periodLabel}>
          <span
            className="text-lg font-semibold font-mono tabular-nums sm:text-xl lg:text-2xl"
            style={{ color: "#ef4444" }}
          >
            {stats.maxDrawdown}%
          </span>
        </SummaryCard>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  SummaryCard wrapper                                                */
/* ------------------------------------------------------------------ */

function SummaryCard({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        backgroundColor: "#1e293b",
        borderColor: "#334155",
      }}
    >
      <h3 className="mb-1 text-xs font-medium" style={{ color: "#94a3b8" }}>
        {title}
      </h3>
      {children}
      <p className="mt-1 text-xs" style={{ color: "#64748b" }}>
        {sub}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton loading state                                             */
/* ------------------------------------------------------------------ */

function SkeletonCard({ periodLabel }: { periodLabel: string }) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        backgroundColor: "#1e293b",
        borderColor: "#334155",
      }}
    >
      <div className="mb-1 h-3 w-16 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
      <div className="h-7 w-28 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
      <p className="mt-1 text-xs" style={{ color: "#64748b" }}>
        {periodLabel}
      </p>
    </div>
  );
}

function SummarySkeleton({ periodLabel }: { periodLabel: string }) {
  return (
    <section aria-label="성과 요약">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SkeletonCard periodLabel={periodLabel} />
        <SkeletonCard periodLabel={periodLabel} />
        <SkeletonCard periodLabel={periodLabel} />
        <SkeletonCard periodLabel={periodLabel} />
        <SkeletonCard periodLabel={periodLabel} />
      </div>
    </section>
  );
}
