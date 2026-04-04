import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { Pagination } from "../components/trades/Pagination.tsx";
import { PerformanceSummary } from "../components/trades/PerformanceSummary.tsx";
import { TradeFilters } from "../components/trades/TradeFilters.tsx";
import { TradesTable } from "../components/trades/TradesTable.tsx";
import { useTickets } from "../hooks/useApi.ts";

const PAGE_SIZE = 20;

export function TradesPage() {
  const [searchParams] = useSearchParams();

  const period = searchParams.get("period") ?? "30d";
  const symbol = searchParams.get("symbol") ?? undefined;
  const exchange = searchParams.get("exchange") ?? undefined;
  const result = searchParams.get("result") ?? undefined;
  const page = Number(searchParams.get("page") ?? "1");

  // Build cursor from page for offset-based pagination presentation
  const cursorParam = page > 1 ? String((page - 1) * PAGE_SIZE) : undefined;

  const { data: ticketsData, isLoading } = useTickets({
    period,
    symbol,
    exchange,
    result,
    cursor: cursorParam,
    limit: PAGE_SIZE,
  });

  const tickets = ticketsData?.items ?? [];
  const total = ticketsData?.total ?? 0;
  const hasNextCursor = ticketsData?.cursor !== null && ticketsData?.cursor !== undefined;

  // Update document title
  useEffect(() => {
    document.title = "거래 내역 — COMBINE TRADE";
    return () => {
      document.title = "COMBINE TRADE";
    };
  }, []);

  return (
    <main id="main" className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-col gap-6">
        {/* Performance summary cards */}
        <PerformanceSummary period={period} />

        {/* Filters */}
        <TradeFilters />

        {/* Trades table */}
        <TradesTable tickets={tickets} total={total} isLoading={isLoading} />

        {/* Pagination */}
        {!isLoading && total > 0 && (
          <div className="flex justify-end">
            <Pagination total={total} limit={PAGE_SIZE} hasNextCursor={hasNextCursor} />
          </div>
        )}
      </div>
    </main>
  );
}
