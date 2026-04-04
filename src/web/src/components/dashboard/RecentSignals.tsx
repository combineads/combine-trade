import type { Signal } from "../../hooks/useApi.ts";
import { useSignalsRecent } from "../../hooks/useApi.ts";

/** Map signal result to dot color */
function getDotColor(result: string): string {
  const lower = result.toLowerCase();
  if (lower.includes("체결") || lower.includes("통과") || lower.includes("filled")) {
    return "#22c55e"; // green
  }
  if (lower.includes("watching") || lower.includes("시작")) {
    return "#a855f7"; // purple
  }
  if (lower.includes("거부") || lower.includes("reject") || lower.includes("denied")) {
    return "#ef4444"; // red
  }
  // default to muted
  return "#94a3b8";
}

export function RecentSignals() {
  const { data: signals, isLoading } = useSignalsRecent();

  if (isLoading) {
    return <RecentSignalsSkeleton />;
  }

  const items = (signals ?? []).slice(0, 5);

  return (
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

      {items.length === 0 ? (
        <p className="py-4 text-center text-sm" style={{ color: "#64748b" }}>
          최근 시그널 없음
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((signal) => (
            <SignalItem key={signal.id} signal={signal} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SignalItem({ signal }: { signal: Signal }) {
  const dotColor = getDotColor(signal.result);

  const timeFmt = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const timeStr = timeFmt.format(new Date(signal.time));

  const description =
    `${signal.symbol} ${signal.type} ${signal.result ? `\u2192 ${signal.result}` : ""}`.trim();

  return (
    <li className="flex items-start gap-2 text-sm" style={{ color: "#f1f5f9" }}>
      <span
        className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: dotColor }}
        aria-hidden="true"
      />
      <span>
        <span className="font-mono tabular-nums" style={{ color: "#64748b" }}>
          {timeStr}
        </span>{" "}
        {description}
      </span>
    </li>
  );
}

function RecentSignalsSkeleton() {
  return (
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
        style={{ backgroundColor: "#334155", width: "75%" }}
      />
      <div
        className="mb-2 h-4 animate-pulse rounded"
        style={{ backgroundColor: "#334155", width: "70%" }}
      />
      <div
        className="mb-2 h-4 animate-pulse rounded"
        style={{ backgroundColor: "#334155", width: "65%" }}
      />
      <div
        className="mb-2 h-4 animate-pulse rounded"
        style={{ backgroundColor: "#334155", width: "60%" }}
      />
    </div>
  );
}
