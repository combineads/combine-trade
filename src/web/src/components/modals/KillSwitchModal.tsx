import { useCallback, useEffect, useRef } from "react";

interface KillSwitchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function KillSwitchModal({ isOpen, onClose, onConfirm }: KillSwitchModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus trap: Tab cycles inside modal only
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

  // Lock body scroll and attach keydown listener
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    // Focus the cancel button on open
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
      aria-label="긴급 청산 확인"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: "rgba(0,0,0,0.6)",
        overscrollBehavior: "contain",
        touchAction: "manipulation",
      }}
      onClick={(e) => {
        // Close on overlay click
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
          borderColor: "#ef4444",
        }}
      >
        <h2 className="mb-3 text-lg font-bold" style={{ color: "#ef4444" }}>
          정말 긴급 청산을 실행하시겠습니까?
        </h2>

        <p className="mb-6 text-sm" style={{ color: "#94a3b8" }}>
          모든 거래소의 전체 포지션이 시장가로 청산되고, 모든 미체결 주문이 취소됩니다.
        </p>

        <div className="flex items-center justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2"
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
            className="rounded-md px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
            style={{ backgroundColor: "#ef4444" }}
          >
            긴급 청산 실행
          </button>
        </div>
      </div>
    </div>
  );
}
