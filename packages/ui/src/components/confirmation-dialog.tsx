export interface ConfirmationDialogProps {
	open: boolean;
	title: string;
	message: string;
	confirmLabel: string;
	variant?: "danger" | "primary";
	onConfirm: () => void;
	onCancel: () => void;
}

export function ConfirmationDialog({
	open,
	title,
	message,
	confirmLabel,
	variant = "danger",
	onConfirm,
	onCancel,
}: ConfirmationDialogProps) {
	if (!open) return null;

	const confirmColor = variant === "danger" ? "#EF4444" : "#22C55E";

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				backgroundColor: "rgba(0,0,0,0.5)",
				zIndex: 1000,
			}}
		>
			<div
				style={{
					backgroundColor: "var(--bg-card)",
					border: "1px solid var(--border-subtle)",
					borderRadius: "var(--radius-lg)",
					padding: 24,
					maxWidth: 400,
					width: "100%",
				}}
			>
				<h2
					style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 8px" }}
				>
					{title}
				</h2>
				<p
					style={{
						fontSize: 14,
						color: "var(--text-secondary)",
						margin: "0 0 24px",
						lineHeight: 1.5,
					}}
				>
					{message}
				</p>
				<div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
					<button
						type="button"
						onClick={onCancel}
						style={{
							padding: "8px 16px",
							borderRadius: "var(--radius-md)",
							border: "1px solid var(--border-subtle)",
							backgroundColor: "transparent",
							color: "var(--text-secondary)",
							fontSize: 14,
							cursor: "pointer",
						}}
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onConfirm}
						style={{
							padding: "8px 16px",
							borderRadius: "var(--radius-md)",
							border: "none",
							backgroundColor: confirmColor,
							color: "#FFFFFF",
							fontSize: 14,
							fontWeight: 600,
							cursor: "pointer",
						}}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
