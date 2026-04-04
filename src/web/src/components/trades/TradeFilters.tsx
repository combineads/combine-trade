import { useCallback } from "react";
import { useSearchParams } from "react-router";

const PERIODS = [
  { key: "today", label: "오늘" },
  { key: "7d", label: "7일" },
  { key: "30d", label: "30일" },
  { key: "all", label: "전체" },
] as const;

const SYMBOLS = [
  { value: "", label: "전체" },
  { value: "BTCUSDT", label: "BTCUSDT" },
  { value: "XAUTUSDT", label: "XAUTUSDT" },
] as const;

const EXCHANGES = [
  { value: "", label: "전체" },
  { value: "binance", label: "바이낸스" },
] as const;

const RESULTS = [
  { value: "", label: "전체" },
  { value: "WIN", label: "수익" },
  { value: "LOSS", label: "손실" },
  { value: "TIMEOUT", label: "시간 청산" },
] as const;

export function TradeFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const currentPeriod = searchParams.get("period") ?? "30d";
  const currentSymbol = searchParams.get("symbol") ?? "";
  const currentExchange = searchParams.get("exchange") ?? "";
  const currentResult = searchParams.get("result") ?? "";

  const updateParam = useCallback(
    (key: string, value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) {
            next.set(key, value);
          } else {
            next.delete(key);
          }
          // Reset cursor when filters change
          next.delete("cursor");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return (
    <section aria-label="필터" className="flex flex-wrap items-end gap-4">
      {/* Period tabs */}
      <div>
        <span className="mb-1.5 block text-xs font-medium" style={{ color: "#94a3b8" }}>
          기간
        </span>
        <div role="tablist" aria-label="기간 선택" className="flex gap-1">
          {PERIODS.map(({ key, label }) => {
            const isActive = currentPeriod === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => updateParam("period", key)}
                className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                style={{
                  backgroundColor: isActive ? "#17b862" : "transparent",
                  color: isActive ? "#ffffff" : "#94a3b8",
                  border: isActive ? "1px solid #17b862" : "1px solid #334155",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Symbol dropdown */}
      <FilterSelect
        label="심볼"
        value={currentSymbol}
        options={SYMBOLS}
        onChange={(v) => updateParam("symbol", v)}
      />

      {/* Exchange dropdown */}
      <FilterSelect
        label="거래소"
        value={currentExchange}
        options={EXCHANGES}
        onChange={(v) => updateParam("exchange", v)}
      />

      {/* Result dropdown */}
      <FilterSelect
        label="결과"
        value={currentResult}
        options={RESULTS}
        onChange={(v) => updateParam("result", v)}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  FilterSelect helper                                                */
/* ------------------------------------------------------------------ */

interface FilterSelectProps {
  label: string;
  value: string;
  options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  onChange: (value: string) => void;
}

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  const id = `filter-${label}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium" style={{ color: "#94a3b8" }}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        style={{
          backgroundColor: "#0f172a",
          borderColor: "#334155",
          color: "#f1f5f9",
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
