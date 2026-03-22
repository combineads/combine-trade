import type { CSSProperties, ReactNode } from "react";

export type CardState = "default" | "active" | "paused" | "draft" | "error" | "kill-switch";

export interface CardProps {
	children: ReactNode;
	state?: CardState;
	style?: CSSProperties;
}

function getStateStyles(state: CardState): CSSProperties {
	switch (state) {
		case "active":
			return { borderLeft: "3px solid #22C55E" };
		case "paused":
			return { borderLeft: "3px solid #F59E0B", opacity: 0.7 };
		case "draft":
			return { borderStyle: "dashed" };
		case "error":
			return { backgroundColor: "rgba(239,68,68,0.06)" };
		case "kill-switch":
			return { borderLeft: "3px solid #EF4444", backgroundColor: "rgba(239,68,68,0.08)" };
		default:
			return {};
	}
}

export function Card({ children, state = "default", style }: CardProps) {
	return (
		<div
			style={{
				backgroundColor: "var(--bg-card)",
				border: "1px solid var(--border-subtle)",
				borderRadius: "var(--radius-md)",
				padding: 16,
				...getStateStyles(state),
				...style,
			}}
		>
			{children}
		</div>
	);
}
