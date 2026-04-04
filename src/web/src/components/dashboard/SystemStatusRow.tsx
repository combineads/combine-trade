import { useHealth } from "../../hooks/useApi.ts";

export function SystemStatusRow() {
  const { data: health, isLoading } = useHealth();

  if (isLoading || !health) {
    return <SkeletonRow />;
  }

  const lossPercent =
    health.dailyLoss.limit > 0 ? (health.dailyLoss.current / health.dailyLoss.limit) * 100 : 0;

  const lossBarColor = lossPercent >= 90 ? "#ef4444" : lossPercent >= 70 ? "#f59e0b" : "#22c55e";

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="시스템 상태">
      {/* Daemon status */}
      <StatusCard title="데몬 상태">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{
              backgroundColor: health.status === "ok" ? "#22c55e" : "#ef4444",
            }}
            aria-hidden="true"
          />
          <span className="text-sm" style={{ color: "#f1f5f9" }}>
            {health.status === "ok" ? "정상 가동" : "이상 감지"}
          </span>
        </div>
        <p className="mt-1 font-mono text-xs tabular-nums" style={{ color: "#94a3b8" }}>
          {health.uptime}
        </p>
      </StatusCard>

      {/* Exchange connection */}
      <StatusCard title="거래소 연결">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{
              backgroundColor: health.exchange.connected ? "#22c55e" : "#ef4444",
            }}
            aria-hidden="true"
          />
          <span className="text-sm" style={{ color: "#f1f5f9" }}>
            {health.exchange.name}
          </span>
        </div>
        <p className="mt-1 text-xs" style={{ color: "#94a3b8" }}>
          {health.exchange.connected ? "연결됨" : "연결 끊김"}
        </p>
      </StatusCard>

      {/* Daily loss limit */}
      <StatusCard title="오늘 손실 한도">
        <p className="text-sm font-mono tabular-nums" style={{ color: "#f1f5f9" }}>
          {health.dailyLoss.current.toFixed(1)}% / {health.dailyLoss.limit}%
        </p>
        <div
          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: "#334155" }}
          role="progressbar"
          aria-valuenow={Math.round(lossPercent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`손실 한도 ${Math.round(lossPercent)}% 사용`}
        >
          <div
            className="h-full rounded-full transition-[width]"
            style={{
              width: `${Math.min(lossPercent, 100)}%`,
              backgroundColor: lossBarColor,
            }}
          />
        </div>
      </StatusCard>

      {/* Session losses */}
      <StatusCard title="세션 손실">
        <p className="text-sm font-mono tabular-nums" style={{ color: "#f1f5f9" }}>
          {health.sessionLosses.current}회 / {health.sessionLosses.limit}회
        </p>
      </StatusCard>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  StatusCard wrapper                                                 */
/* ------------------------------------------------------------------ */

function StatusCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        backgroundColor: "#1e293b",
        borderColor: "#334155",
      }}
    >
      <h3 className="mb-2 text-xs font-medium" style={{ color: "#94a3b8" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton loading state                                             */
/* ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        backgroundColor: "#1e293b",
        borderColor: "#334155",
      }}
    >
      <div className="mb-2 h-3 w-20 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
      <div className="h-4 w-24 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
