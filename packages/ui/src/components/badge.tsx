export type BadgeStatus = "active" | "stopped" | "warning" | "draft";

const STATUS_COLORS: Record<BadgeStatus, { bg: string; text: string; border: string }> = {
	active: { bg: "rgba(34,197,94,0.12)", text: "#22C55E", border: "rgba(34,197,94,0.25)" },
	stopped: { bg: "rgba(239,68,68,0.12)", text: "#EF4444", border: "rgba(239,68,68,0.25)" },
	warning: { bg: "rgba(245,158,11,0.12)", text: "#F59E0B", border: "rgba(245,158,11,0.25)" },
	draft: { bg: "rgba(100,116,139,0.12)", text: "#64748B", border: "rgba(100,116,139,0.25)" },
};

export interface StatusBadgeProps {
	status: BadgeStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
	const colors = STATUS_COLORS[status];
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 6,
				padding: "2px 8px",
				borderRadius: 9999,
				fontSize: 12,
				fontWeight: 500,
				backgroundColor: colors.bg,
				color: colors.text,
				border: `1px solid ${colors.border}`,
			}}
		>
			<span
				style={{
					width: 6,
					height: 6,
					borderRadius: "50%",
					backgroundColor: colors.text,
				}}
			/>
			{status}
		</span>
	);
}

export type Direction = "LONG" | "SHORT" | "PASS";

const DIRECTION_COLORS: Record<Direction, string> = {
	LONG: "#22C55E",
	SHORT: "#EF4444",
	PASS: "#64748B",
};

export interface DirectionBadgeProps {
	direction: Direction;
}

export function DirectionBadge({ direction }: DirectionBadgeProps) {
	return (
		<span
			style={{
				display: "inline-block",
				padding: "2px 8px",
				borderRadius: "var(--radius-sm)",
				fontSize: 12,
				fontWeight: 600,
				backgroundColor: DIRECTION_COLORS[direction],
				color: "white",
			}}
		>
			{direction}
		</span>
	);
}
