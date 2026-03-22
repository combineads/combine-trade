export type WorkerState = "running" | "warning" | "down" | "inactive";

export interface WorkerStatusItem {
	name: string;
	status: WorkerState;
}

export interface WorkerStatusProps {
	workers: WorkerStatusItem[];
}

const STATUS_COLORS: Record<WorkerState, string> = {
	running: "#22C55E",
	warning: "#F59E0B",
	down: "#EF4444",
	inactive: "#64748B",
};

export function WorkerStatus({ workers }: WorkerStatusProps) {
	return (
		<div style={{ display: "grid", gap: 8 }}>
			{workers.map((w) => (
				<div
					key={w.name}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						padding: "6px 0",
					}}
				>
					<span
						style={{
							width: 8,
							height: 8,
							borderRadius: "50%",
							backgroundColor: STATUS_COLORS[w.status],
							flexShrink: 0,
						}}
					/>
					<span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
						{w.name}
					</span>
					<span style={{ marginLeft: "auto", fontSize: 12, color: STATUS_COLORS[w.status], textTransform: "capitalize" }}>
						{w.status}
					</span>
				</div>
			))}
		</div>
	);
}
