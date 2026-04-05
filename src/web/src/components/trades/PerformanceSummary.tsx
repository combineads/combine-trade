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

  const expectancyNum = Number(stats.expectancy);
  const expectancyColor = expectancyNum >= 0 ? "#22c55e" : "#ef4444";
  const expectancyPrefix = expectancyNum >= 0 ? "+" : "";
  // pnl_pct 단위(소수)를 퍼센트로 변환해서 표시
  const expectancyPct = (expectancyNum * 100).toFixed(3);

  const mddNum = Number(stats.maxDrawdown);
  const mddDisplay = Number.isFinite(mddNum) ? mddNum.toFixed(2) : "0.00";

  return (
    <section aria-label="성과 요약">
      {/* 7개 성과 카드: 모바일 2열 → sm 3열 → lg 4열 → xl 7열 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {/* 카드 1: 총 수익 */}
        <SummaryCard title="총 수익" sub={periodLabel}>
          <span
            className="text-lg font-semibold font-mono tabular-nums sm:text-xl lg:text-2xl"
            style={{ color: pnlColor }}
          >
            {pnlPrefix}
            {numberFmt.format(pnlNum)} USDT
          </span>
        </SummaryCard>

        {/* 카드 2: 총 거래 */}
        <SummaryCard title="총 거래" sub={periodLabel}>
          <span
            className="text-lg font-semibold font-mono tabular-nums sm:text-xl lg:text-2xl"
            style={{ color: "#f1f5f9" }}
          >
            {stats.totalTrades}건
          </span>
        </SummaryCard>

        {/* 카드 3: 승률 */}
        <SummaryCard title="승률" sub={periodLabel}>
          <span
            className="text-lg font-semibold font-mono tabular-nums sm:text-xl lg:text-2xl"
            style={{ color: winRateColor }}
          >
            {stats.winRate.toFixed(1)}%
          </span>
        </SummaryCard>

        {/* 카드 4: Expectancy (수수료 차감 후) */}
        <SummaryCard title="Expectancy" sub="수수료 차감 후">
          <span
            className="text-lg font-semibold font-mono tabular-nums sm:text-xl lg:text-2xl"
            style={{ color: expectancyColor }}
          >
            {expectancyPrefix}
            {expectancyPct}%
          </span>
        </SummaryCard>

        {/* 카드 5: 평균 손익비 */}
        <SummaryCard title="평균 손익비" sub={periodLabel}>
          <span
            className="text-lg font-semibold font-mono tabular-nums sm:text-xl lg:text-2xl"
            style={{ color: "#f1f5f9" }}
          >
            1:{stats.avgRiskReward}
          </span>
        </SummaryCard>

        {/* 카드 6: MDD */}
        <SummaryCard title="최대 낙폭(MDD)" sub={periodLabel}>
          <span
            className="text-lg font-semibold font-mono tabular-nums sm:text-xl lg:text-2xl"
            style={{ color: "#ef4444" }}
          >
            {mddDisplay}%
          </span>
        </SummaryCard>

        {/* 카드 7: 최대 연속 손실 */}
        <SummaryCard title="최대 연속 손실" sub={periodLabel}>
          <span
            className="text-lg font-semibold font-mono tabular-nums sm:text-xl lg:text-2xl"
            style={{ color: stats.maxConsecutiveLosses > 0 ? "#ef4444" : "#f1f5f9" }}
          >
            {stats.maxConsecutiveLosses}연속
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders have no stable identity
          <SkeletonCard key={i} periodLabel={periodLabel} />
        ))}
      </div>
    </section>
  );
}
