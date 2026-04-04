import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

interface PaginationProps {
  total: number;
  limit: number;
  hasNextCursor: boolean;
}

export function Pagination({ total, limit, hasNextCursor }: PaginationProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  const currentPage = Number(searchParams.get("page") ?? "1");
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const goToPage = useCallback(
    (page: number) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (page <= 1) {
            next.delete("page");
            next.delete("cursor");
          } else {
            next.set("page", String(page));
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const pageNumbers = useMemo(
    () => buildPageNumbers(currentPage, totalPages),
    [currentPage, totalPages],
  );

  if (totalPages <= 1) {
    return null;
  }

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages || hasNextCursor;

  return (
    <nav aria-label="페이지네이션" className="flex items-center gap-1">
      {/* Previous */}
      <PageButton
        disabled={!hasPrev}
        onClick={() => goToPage(currentPage - 1)}
        aria-label="이전 페이지"
      >
        이전
      </PageButton>

      {/* Page numbers */}
      {pageNumbers.map((item) =>
        item.type === "ellipsis" ? (
          <span
            key={item.key}
            className="px-1.5 text-sm"
            style={{ color: "#64748b" }}
            aria-hidden="true"
          >
            ...
          </span>
        ) : (
          <PageButton
            key={item.key}
            active={item.page === currentPage}
            onClick={() => goToPage(item.page)}
            aria-label={`${item.page} 페이지`}
            aria-current={item.page === currentPage ? "page" : undefined}
          >
            {item.page}
          </PageButton>
        ),
      )}

      {/* Next */}
      <PageButton
        disabled={!hasNext}
        onClick={() => goToPage(currentPage + 1)}
        aria-label="다음 페이지"
      >
        다음
      </PageButton>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/*  PageButton                                                         */
/* ------------------------------------------------------------------ */

interface PageButtonProps {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  "aria-label"?: string;
  "aria-current"?: "page" | undefined;
}

function PageButton({
  children,
  active = false,
  disabled = false,
  onClick,
  ...ariaProps
}: PageButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md px-2.5 py-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:pointer-events-none disabled:opacity-40"
      style={{
        backgroundColor: active ? "#17b862" : "transparent",
        color: active ? "#ffffff" : "#94a3b8",
      }}
      {...ariaProps}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Build page number array with ellipsis                              */
/* ------------------------------------------------------------------ */

type PageItem = { type: "page"; page: number; key: string } | { type: "ellipsis"; key: string };

function buildPageNumbers(current: number, total: number): PageItem[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => ({
      type: "page" as const,
      page: i + 1,
      key: `p-${i + 1}`,
    }));
  }

  const pages: PageItem[] = [];

  // Always show first page
  pages.push({ type: "page", page: 1, key: "p-1" });

  if (current > 3) {
    pages.push({ type: "ellipsis", key: "ellipsis-start" });
  }

  // Pages around current
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push({ type: "page", page: i, key: `p-${i}` });
  }

  if (current < total - 2) {
    pages.push({ type: "ellipsis", key: "ellipsis-end" });
  }

  // Always show last page
  pages.push({ type: "page", page: total, key: `p-${total}` });

  return pages;
}
