import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../lib/api.ts";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type TransferEvent = {
  id: string;
  event_type: string;
  symbol: string | null;
  exchange: string | null;
  data: Record<string, unknown>;
  created_at: string;
};

export type TransferHistoryResponse = {
  data: TransferEvent[];
  nextCursor: string | null;
};

export type TriggerTransferResponse = {
  success: boolean;
  result: unknown;
};

/* ------------------------------------------------------------------ */
/*  Query hooks                                                         */
/* ------------------------------------------------------------------ */

/**
 * Fetch paginated transfer event history from GET /api/transfers.
 * Pass a cursor (ISO datetime string) to load older events.
 */
export function useTransferHistory(cursor?: string) {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  const path = qs ? `/transfers?${qs}` : "/transfers";

  return useQuery<TransferHistoryResponse>({
    queryKey: ["transfers", cursor],
    queryFn: () => apiGet<TransferHistoryResponse>(path),
    refetchInterval: 30_000,
  });
}

/**
 * Mutation to trigger an immediate manual transfer via POST /api/transfers/trigger.
 * Invalidates the transfers query on success.
 */
export function useTriggerTransfer() {
  const queryClient = useQueryClient();

  return useMutation<TriggerTransferResponse, Error, string | undefined>({
    mutationFn: (exchange?: string) =>
      apiPost<TriggerTransferResponse>("/transfers/trigger", {
        exchange: exchange ?? "binance",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
    },
  });
}
