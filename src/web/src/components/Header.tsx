import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { useConfig } from "../hooks/useApi.ts";
import { apiPost } from "../lib/api.ts";

const MODE_LABELS: Record<string, string> = {
  analysis: "분석 모드",
  alert: "알림 모드",
  live: "실거래 모드",
};

const MODE_COLORS: Record<string, string> = {
  analysis: "#3b82f6",
  alert: "#f59e0b",
  live: "#17b862",
};

const MODES = ["analysis", "alert", "live"] as const;

export function Header() {
  const location = useLocation();
  const { data: config } = useConfig();
  const [modeOpen, setModeOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentMode = config?.mode ?? "analysis";
  const tradeBlock = config?.tradeBlock ?? false;

  // Close dropdown on outside click
  useEffect(() => {
    if (!modeOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setModeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [modeOpen]);

  const handleModeChange = useCallback(async (mode: string) => {
    if (mode === "live") {
      const confirmed = window.confirm("실거래 모드로 전환하시겠습니까? 실제 주문이 실행됩니다.");
      if (!confirmed) {
        setModeOpen(false);
        return;
      }
    }
    try {
      await apiPost("/config/mode", { mode });
    } catch {
      // best effort
    }
    setModeOpen(false);
  }, []);

  const handleTradeBlockToggle = useCallback(async () => {
    try {
      await apiPost("/config/trade-block", { active: !tradeBlock });
    } catch {
      // best effort
    }
  }, [tradeBlock]);

  const handleKillSwitch = useCallback(() => {
    const confirmed = window.confirm(
      "정말 긴급 청산을 실행하시겠습니까?\n모든 거래소의 전체 포지션이 시장가로 청산되고, 모든 미체결 주문이 취소됩니다.",
    );
    if (!confirmed) return;
    apiPost("/kill-switch").catch(() => {});
  }, []);

  return (
    <header
      className="flex items-center justify-between border-b px-4 py-3"
      style={{ borderColor: "#334155", backgroundColor: "#0a0e14" }}
    >
      {/* Left: Logo + Nav */}
      <div className="flex items-center gap-6">
        <Link to="/" className="text-lg font-bold tracking-tight" style={{ color: "#17b862" }}>
          COMBINE TRADE
        </Link>
        <nav aria-label="메인 네비게이션" className="flex items-center gap-4">
          <NavLink to="/" active={location.pathname === "/"}>
            대시보드
          </NavLink>
          <NavLink to="/trades" active={location.pathname === "/trades"}>
            거래 내역
          </NavLink>
        </nav>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-3">
        {/* Mode dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setModeOpen((v) => !v)}
            className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            style={{
              borderColor: "#334155",
              backgroundColor: "#0f172a",
              color: "#f1f5f9",
            }}
            aria-haspopup="true"
            aria-expanded={modeOpen}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: MODE_COLORS[currentMode] }}
              aria-hidden="true"
            />
            {MODE_LABELS[currentMode]}
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {modeOpen && (
            <div
              className="absolute right-0 z-20 mt-1 w-40 rounded-md border py-1"
              style={{
                borderColor: "#334155",
                backgroundColor: "#1e293b",
              }}
            >
              {MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleModeChange(mode)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-neutral-700"
                  style={{
                    color: mode === currentMode ? (MODE_COLORS[mode] ?? "#f1f5f9") : "#f1f5f9",
                  }}
                  aria-current={mode === currentMode ? "true" : undefined}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: MODE_COLORS[mode] }}
                    aria-hidden="true"
                  />
                  {MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Trade Block toggle */}
        <label className="flex items-center gap-2 text-sm" style={{ color: "#94a3b8" }}>
          <span>수동 차단</span>
          <button
            type="button"
            role="switch"
            aria-checked={tradeBlock}
            onClick={handleTradeBlockToggle}
            className="relative h-5 w-9 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            style={{
              backgroundColor: tradeBlock ? "#f97316" : "#334155",
            }}
          >
            <span
              className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform"
              style={{
                transform: tradeBlock ? "translateX(16px)" : "translateX(0)",
              }}
            />
          </button>
        </label>

        {/* Kill switch */}
        <button
          type="button"
          onClick={handleKillSwitch}
          className="rounded-md px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
          style={{ backgroundColor: "#ef4444" }}
        >
          긴급 청산
        </button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/*  NavLink helper                                                     */
/* ------------------------------------------------------------------ */

function NavLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
      style={{
        color: active ? "#f1f5f9" : "#94a3b8",
        textDecoration: "none",
        borderBottom: active ? "2px solid #17b862" : "2px solid transparent",
        paddingBottom: "2px",
      }}
    >
      {children}
    </Link>
  );
}
