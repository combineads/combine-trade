export interface PaperTradingBannerProps {
	active: boolean;
	strategyName?: string;
}

export function PaperTradingBanner({ active, strategyName }: PaperTradingBannerProps) {
	if (!active) return null;

	const message = strategyName
		? `Paper Trading Active — ${strategyName}`
		: "Paper Trading Active";

	return (
		<div
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				zIndex: 9998,
				backgroundColor: "#F59E0B",
				color: "#000",
				padding: "8px 24px",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				fontSize: 13,
				fontWeight: 500,
			}}
		>
			<span>{message}</span>
		</div>
	);
}

export function PaperBadge() {
	return (
		<span
			style={{
				display: "inline-block",
				padding: "2px 6px",
				fontSize: 10,
				fontWeight: 700,
				fontFamily: "var(--font-mono)",
				textTransform: "uppercase",
				backgroundColor: "rgba(245,158,11,0.15)",
				color: "#F59E0B",
				borderRadius: 3,
			}}
		>
			PAPER
		</span>
	);
}

export interface PaperOrderCardProps {
	children: React.ReactNode;
	isPaper?: boolean;
}

export function PaperOrderCard({ children, isPaper = false }: PaperOrderCardProps) {
	return (
		<div
			style={{
				borderLeft: isPaper ? "2px dashed #F59E0B" : undefined,
			}}
		>
			{children}
		</div>
	);
}
