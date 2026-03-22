export type BannerVariant = "critical" | "warning" | "info";

export interface NotificationBannerProps {
	active: boolean;
	variant?: BannerVariant;
	message: string;
	actionLabel?: string;
	onAction?: () => void;
}

const VARIANT_STYLES: Record<BannerVariant, { bg: string; color: string }> = {
	critical: { bg: "#EF4444", color: "#fff" },
	warning: { bg: "#F59E0B", color: "#000" },
	info: { bg: "#3B82F6", color: "#fff" },
};

export function NotificationBanner({
	active,
	variant = "critical",
	message,
	actionLabel,
	onAction,
}: NotificationBannerProps) {
	if (!active) return null;

	const styles = VARIANT_STYLES[variant];

	return (
		<div
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				zIndex: 9999,
				backgroundColor: styles.bg,
				color: styles.color,
				padding: "8px 24px",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				gap: 16,
				fontSize: 13,
				fontWeight: 600,
			}}
		>
			<span>{message}</span>
			{actionLabel && onAction && (
				<button
					type="button"
					onClick={onAction}
					style={{
						padding: "4px 12px",
						fontSize: 12,
						fontWeight: 600,
						backgroundColor: "rgba(255,255,255,0.2)",
						color: styles.color,
						border: "1px solid rgba(255,255,255,0.3)",
						borderRadius: "var(--radius-sm)",
						cursor: "pointer",
					}}
				>
					{actionLabel}
				</button>
			)}
		</div>
	);
}

export function KillSwitchBanner({ active }: { active: boolean }) {
	return (
		<NotificationBanner
			active={active}
			variant="critical"
			message="Kill Switch Active — All trading is halted"
		/>
	);
}
