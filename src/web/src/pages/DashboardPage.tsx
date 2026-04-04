import { PositionsTable } from "../components/dashboard/PositionsTable.tsx";
import { SymbolCard, SymbolCardSkeleton } from "../components/dashboard/SymbolCard.tsx";
import { SystemStatusRow } from "../components/dashboard/SystemStatusRow.tsx";
import { useSymbolStates } from "../hooks/useApi.ts";

export function DashboardPage() {
  const { data: symbolStates, isLoading: symbolsLoading } = useSymbolStates();

  return (
    <main id="main" className="mx-auto max-w-7xl px-4 py-6">
      {/* 2-column grid: left 60%, right 40% — mobile: 1 column */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left column (3/5 = 60%) */}
        <div className="flex flex-col gap-6 lg:col-span-3">
          {/* System status row */}
          <SystemStatusRow />

          {/* Symbol cards */}
          <section aria-label="심볼 상태">
            <div className="flex flex-col gap-4">
              {symbolsLoading && (
                <>
                  <SymbolCardSkeleton />
                  <SymbolCardSkeleton />
                </>
              )}
              {!symbolsLoading &&
                symbolStates?.map((state) => (
                  <SymbolCard key={`${state.symbol}-${state.exchange}`} state={state} />
                ))}
              {!symbolsLoading && symbolStates?.length === 0 && (
                <div
                  className="rounded-lg border py-8 text-center text-sm"
                  style={{
                    backgroundColor: "#1e293b",
                    borderColor: "#334155",
                    color: "#64748b",
                  }}
                >
                  등록된 심볼 없음
                </div>
              )}
            </div>
          </section>

          {/* Positions table */}
          <section aria-label="활성 포지션">
            <PositionsTable />
          </section>
        </div>

        {/* Right column (2/5 = 40%) — placeholder for Wave 7 */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <RightColumnPlaceholder />
        </div>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Placeholder for right column (T-11-011)                            */
/* ------------------------------------------------------------------ */

function RightColumnPlaceholder() {
  return (
    <>
      {/* Today's performance placeholder */}
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
        <div className="h-10 w-40 animate-pulse rounded" style={{ backgroundColor: "#334155" }} />
        <div
          className="mt-2 h-4 w-28 animate-pulse rounded"
          style={{ backgroundColor: "#334155" }}
        />
      </div>

      {/* Recent trades placeholder */}
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
          style={{ backgroundColor: "#334155", width: "75%" }}
        />
        <div
          className="mb-2 h-4 animate-pulse rounded"
          style={{ backgroundColor: "#334155", width: "65%" }}
        />
      </div>

      {/* Recent signals placeholder */}
      <div
        className="rounded-lg border p-4"
        style={{
          backgroundColor: "#1e293b",
          borderColor: "#334155",
        }}
      >
        <h2 className="mb-3 text-sm font-medium" style={{ color: "#94a3b8" }}>
          최근 시그널
        </h2>
        <div
          className="mb-2 h-4 animate-pulse rounded"
          style={{ backgroundColor: "#334155", width: "80%" }}
        />
        <div
          className="mb-2 h-4 animate-pulse rounded"
          style={{ backgroundColor: "#334155", width: "70%" }}
        />
        <div
          className="mb-2 h-4 animate-pulse rounded"
          style={{ backgroundColor: "#334155", width: "60%" }}
        />
      </div>
    </>
  );
}
