import { useCallback, useEffect, useRef, useState } from "react";
import type { TransferEvent } from "../../hooks/useTransfers.ts";
import { useTransferHistory, useTriggerTransfer } from "../../hooks/useTransfers.ts";

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

export function TransferHistory() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allEvents, setAllEvents] = useState<TransferEvent[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useTransferHistory(cursor);
  const triggerMutation = useTriggerTransfer();

  // Accumulate events across pages
  useEffect(() => {
    if (data?.data && data.data.length > 0) {
      setAllEvents((prev) => {
        const existingIds = new Set(prev.map((e) => e.id));
        const newEvents = data.data.filter((e) => !existingIds.has(e.id));
        return [...prev, ...newEvents];
      });
    }
  }, [data]);

  // Reset when cursor is cleared (refresh)
  useEffect(() => {
    if (cursor === undefined) {
      setAllEvents([]);
    }
  }, [cursor]);

  // Re-populate after clearing on invalidation
  useEffect(() => {
    if (cursor === undefined && data?.data) {
      setAllEvents(data.data);
    }
  }, [cursor, data]);

  const handleLoadMore = () => {
    if (data?.nextCursor) {
      setCursor(data.nextCursor);
    }
  };

  const handleTriggerClick = () => {
    setDialogOpen(true);
  };

  const handleDialogConfirm = () => {
    setDialogOpen(false);
    triggerMutation.mutate(undefined);
  };

  const handleDialogCancel = () => {
    setDialogOpen(false);
  };

  return (
    <>
      <div>
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: "#f1f5f9" }}>
            이체 이력
          </h2>
          <button
            type="button"
            onClick={handleTriggerClick}
            disabled={triggerMutation.isPending}
            className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              backgroundColor: triggerMutation.isPending ? "#334155" : "#17b862",
              color: triggerMutation.isPending ? "#64748b" : "#fff",
              cursor: triggerMutation.isPending ? "not-allowed" : "pointer",
            }}
          >
            {triggerMutation.isPending ? "이체 중..." : "즉시 이체"}
          </button>
        </div>

        {/* Status message */}
        {triggerMutation.isSuccess && (
          <div
            className="mb-3 rounded-md px-3 py-2 text-xs"
            style={{ backgroundColor: "#052e16", color: "#22c55e" }}
          >
            이체 완료
          </div>
        )}
        {triggerMutation.isError && (
          <div
            className="mb-3 rounded-md px-3 py-2 text-xs"
            style={{ backgroundColor: "#450a0a", color: "#ef4444" }}
          >
            이체 실패: {triggerMutation.error?.message ?? "알 수 없는 오류"}
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && allEvents.length === 0 && <TransferSkeleton />}

        {/* Empty state */}
        {!isLoading && allEvents.length === 0 && (
          <div
            className="rounded-lg border py-8 text-center text-sm"
            style={{
              backgroundColor: "#1e293b",
              borderColor: "#334155",
              color: "#64748b",
            }}
          >
            이체 이력 없음
          </div>
        )}

        {/* Table */}
        {allEvents.length > 0 && (
          <div
            className="overflow-x-auto rounded-lg border"
            style={{
              backgroundColor: "#1e293b",
              borderColor: "#334155",
            }}
          >
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "#334155" }}>
                  <th scope="col" className="px-3 py-2 font-medium" style={{ color: "#94a3b8" }}>
                    시각
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium" style={{ color: "#94a3b8" }}>
                    거래소
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-right font-medium"
                    style={{ color: "#94a3b8" }}
                  >
                    금액
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium" style={{ color: "#94a3b8" }}>
                    상태
                  </th>
                </tr>
              </thead>
              <tbody>
                {allEvents.map((event) => (
                  <TransferRow key={event.id} event={event} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Load more */}
        {data?.nextCursor && (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={isLoading}
              className="rounded-md border px-4 py-1.5 text-xs font-medium transition-colors"
              style={{
                borderColor: "#334155",
                color: "#94a3b8",
                backgroundColor: "transparent",
              }}
            >
              더 보기
            </button>
          </div>
        )}
      </div>

      {/* Confirmation dialog */}
      <TransferConfirmModal
        isOpen={dialogOpen}
        onConfirm={handleDialogConfirm}
        onClose={handleDialogCancel}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Table row                                                           */
/* ------------------------------------------------------------------ */

function TransferRow({ event }: { event: TransferEvent }) {
  const { text: statusText, bg: statusBg } = getStatusColor(event.event_type);
  const label = getStatusLabel(event.event_type);
  const amount = extractAmount(event.data);
  const timeStr = formatTime(event.created_at);

  return (
    <tr
      className="border-b last:border-b-0 transition-colors"
      style={{ borderColor: "#334155" }}
    >
      <td className="px-3 py-2 font-mono tabular-nums text-xs" style={{ color: "#64748b" }}>
        {timeStr}
      </td>
      <td className="px-3 py-2" style={{ color: "#94a3b8" }}>
        {event.exchange ?? "—"}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular-nums" style={{ color: "#f1f5f9" }}>
        {amount !== "—" ? `${amount} USDT` : "—"}
      </td>
      <td className="px-3 py-2">
        <span
          className="rounded px-1.5 py-0.5 text-xs font-medium"
          style={{ backgroundColor: statusBg, color: statusText }}
        >
          {label}
        </span>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/*  Confirmation modal                                                  */
/* ------------------------------------------------------------------ */

interface TransferConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function TransferConfirmModal({ isOpen, onClose, onConfirm }: TransferConfirmModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const focusable = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    cancelRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="즉시 이체 확인"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: "rgba(0,0,0,0.6)",
        overscrollBehavior: "contain",
        touchAction: "manipulation",
      }}
      onClick={(e) => {
        if (e.target === overlayRef.current) {
          onClose();
        }
      }}
      onKeyDown={() => {
        /* keyboard handled via document listener */
      }}
    >
      <div
        className="mx-4 w-full max-w-md rounded-lg border-2 p-6"
        style={{
          backgroundColor: "#1e293b",
          borderColor: "#17b862",
        }}
      >
        <h2 className="mb-3 text-lg font-bold" style={{ color: "#f1f5f9" }}>
          즉시 이체를 실행하시겠습니까?
        </h2>

        <p className="mb-6 text-sm" style={{ color: "#94a3b8" }}>
          현재 설정된 이체 비율에 따라 거래소에서 즉시 이체가 실행됩니다.
        </p>

        <div className="flex items-center justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            className="rounded-md border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              borderColor: "#334155",
              color: "#f1f5f9",
              backgroundColor: "transparent",
              outlineColor: "#334155",
            }}
          >
            취소
          </button>

          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="rounded-md px-4 py-2 text-sm font-bold text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ backgroundColor: "#17b862" }}
          >
            이체 실행
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                            */
/* ------------------------------------------------------------------ */

function TransferSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{ backgroundColor: "#1e293b", borderColor: "#334155" }}
    >
      {[85, 80, 75].map((w) => (
        <div
          key={w}
          className="flex gap-4 border-b px-3 py-3 last:border-b-0"
          style={{ borderColor: "#334155" }}
        >
          <div
            className="h-4 animate-pulse rounded"
            style={{ backgroundColor: "#334155", width: `${w}%` }}
          />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function getStatusColor(eventType: string): { text: string; bg: string } {
  if (eventType === "TRANSFER_SUCCESS") return { text: "#22c55e", bg: "#052e16" };
  if (eventType === "TRANSFER_FAILED") return { text: "#ef4444", bg: "#450a0a" };
  return { text: "#94a3b8", bg: "#334155" };
}

function getStatusLabel(eventType: string): string {
  if (eventType === "TRANSFER_SUCCESS") return "SUCCESS";
  if (eventType === "TRANSFER_FAILED") return "FAILED";
  if (eventType === "TRANSFER_SKIP") return "SKIP";
  return eventType;
}

function extractAmount(data: Record<string, unknown>): string {
  const amount = data.amount;
  if (typeof amount === "string" && amount.length > 0) return amount;
  if (typeof amount === "number") return String(amount);
  return "—";
}

function formatTime(isoTime: string): string {
  const date = new Date(isoTime);
  const now = new Date();

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const timeFmt = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (isToday) return timeFmt.format(date);

  const dateFmt = new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
  return `${dateFmt.format(date)} ${timeFmt.format(date)}`;
}
