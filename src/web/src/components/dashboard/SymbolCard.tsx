import type { SymbolState } from "../../hooks/useApi.ts";

interface FsmStyle {
  label: string;
  color: string;
  bg: string;
  pulse: boolean;
}

interface DirStyle {
  label: string;
  color: string;
  bg: string;
}

const FSM_DEFAULT: FsmStyle = { label: "대기중", color: "#94a3b8", bg: "#334155", pulse: false };

const FSM_CONFIG: Record<string, FsmStyle> = {
  WATCHING: { label: "WATCHING", color: "#a855f7", bg: "#3b0764", pulse: true },
  IDLE: FSM_DEFAULT,
  POSITION: { label: "포지션 보유", color: "#22c55e", bg: "#052e16", pulse: false },
};

const DIR_DEFAULT: DirStyle = { label: "중립", color: "#94a3b8", bg: "#334155" };

const DIRECTION_CONFIG: Record<string, DirStyle> = {
  LONG_ONLY: { label: "LONG ONLY", color: "#22c55e", bg: "#052e16" },
  SHORT_ONLY: { label: "SHORT ONLY", color: "#ef4444", bg: "#450a0a" },
  NEUTRAL: DIR_DEFAULT,
};

interface SymbolCardProps {
  state: SymbolState;
}

export function SymbolCard({ state }: SymbolCardProps) {
  const fsm = FSM_CONFIG[state.fsmState] ?? FSM_DEFAULT;
  const dir = DIRECTION_CONFIG[state.direction] ?? DIR_DEFAULT;

  return (
    <div
      className="rounded-lg border p-4 transition-colors hover:bg-card-hover"
      style={{
        backgroundColor: "#1e293b",
        borderColor: "#334155",
      }}
    >
      {/* Header: Symbol + Exchange badge */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-base font-semibold" style={{ color: "#f1f5f9" }}>
          {state.symbol}
        </span>
        <span
          className="rounded px-1.5 py-0.5 text-xs"
          style={{
            backgroundColor: "#334155",
            color: "#94a3b8",
          }}
        >
          {state.exchange}
        </span>
      </div>

      {/* Current price */}
      <p className="mb-3 font-mono text-xl tabular-nums" style={{ color: "#f1f5f9" }}>
        {formatPrice(state.price)} USDT
      </p>

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-2">
        {/* FSM state badge */}
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium${
            fsm.pulse ? " symbol-card-pulse" : ""
          }`}
          style={{
            backgroundColor: fsm.bg,
            color: fsm.color,
          }}
        >
          {fsm.label}
        </span>

        {/* Direction badge */}
        <span
          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{
            backgroundColor: dir.bg,
            color: dir.color,
          }}
        >
          {dir.label}
        </span>
      </div>

      {/* Trade Block warning bar */}
      {state.tradeBlock.active && (
        <div
          className="mt-3 rounded px-3 py-2 text-xs font-medium"
          style={{
            backgroundColor: "rgba(249, 115, 22, 0.15)",
            color: "#f97316",
            border: "1px solid rgba(249, 115, 22, 0.3)",
          }}
        >
          Trade Block 활성
          {state.tradeBlock.reason ? ` — ${state.tradeBlock.reason}` : ""}
          {state.tradeBlock.until ? ` (${state.tradeBlock.until}까지)` : ""}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton loading state                                             */
/* ------------------------------------------------------------------ */

export function SymbolCardSkeleton() {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        backgroundColor: "#1e293b",
        borderColor: "#334155",
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <div className="h-4 w-24 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
        <div className="h-4 w-16 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
      </div>
      <div className="mb-3 h-6 w-40 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
      <div className="flex gap-2">
        <div
          className="h-5 w-20 animate-pulse rounded-full"
          style={{ backgroundColor: "#334155" }}
        />
        <div
          className="h-5 w-20 animate-pulse rounded-full"
          style={{ backgroundColor: "#334155" }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatPrice(price: string): string {
  const num = Number(price);
  if (Number.isNaN(num)) return price;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}
