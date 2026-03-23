export interface KillSwitchControlProps {
	active: boolean;
	reason?: string;
	onActivate?: () => void;
	onDeactivate?: () => void;
}

export function KillSwitchControl({
	active,
	reason,
	onActivate,
	onDeactivate,
}: KillSwitchControlProps) {
	if (active) {
		return (
			<div
				style={{
					backgroundColor: "#EF4444",
					border: "2px solid #DC2626",
					borderRadius: "var(--radius-lg)",
					padding: 24,
				}}
			>
				<div
					style={{
						fontSize: 11,
						color: "rgba(255,255,255,0.7)",
						textTransform: "uppercase",
						fontWeight: 600,
						marginBottom: 8,
						letterSpacing: "0.05em",
					}}
				>
					KILL SWITCH
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
					<span
						style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#FFFFFF" }}
					/>
					<span
						style={{
							fontSize: 12,
							fontWeight: 600,
							color: "#FFFFFF",
							backgroundColor: "rgba(0,0,0,0.15)",
							padding: "2px 8px",
							borderRadius: 9999,
						}}
					>
						TRIGGERED
					</span>
				</div>
				<div style={{ fontSize: 22, fontWeight: 700, color: "#FFFFFF", marginBottom: 8 }}>
					ALL TRADING HALTED
				</div>
				{reason && (
					<div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", marginBottom: 16 }}>
						{reason}
					</div>
				)}
				<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
					<button
						type="button"
						onClick={onDeactivate}
						style={{
							padding: "10px 20px",
							borderRadius: "var(--radius-md)",
							backgroundColor: "#DC2626",
							color: "#FFFFFF",
							border: "none",
							fontWeight: 600,
							fontSize: 14,
							cursor: "pointer",
						}}
					>
						Release Kill Switch
					</button>
					<span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Ctrl+Shift+K</span>
				</div>
			</div>
		);
	}

	return (
		<div
			style={{
				backgroundColor: "var(--bg-card)",
				border: "2px solid #22C55E",
				borderRadius: "var(--radius-lg)",
				padding: 24,
			}}
		>
			<div
				style={{
					fontSize: 11,
					color: "var(--text-muted)",
					textTransform: "uppercase",
					fontWeight: 600,
					marginBottom: 8,
					letterSpacing: "0.05em",
				}}
			>
				KILL SWITCH
			</div>
			<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
				<span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#22C55E" }} />
				<span
					style={{
						fontSize: 12,
						fontWeight: 600,
						color: "#22C55E",
						backgroundColor: "rgba(34,197,94,0.1)",
						padding: "2px 8px",
						borderRadius: 9999,
					}}
				>
					ARMED
				</span>
			</div>
			<div
				style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}
			>
				Trading Active
			</div>
			<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
				<button
					type="button"
					onClick={onActivate}
					style={{
						padding: "10px 20px",
						borderRadius: "var(--radius-md)",
						backgroundColor: "#EF4444",
						color: "#FFFFFF",
						border: "none",
						fontWeight: 600,
						fontSize: 14,
						cursor: "pointer",
					}}
				>
					Activate Kill Switch
				</button>
				<span style={{ fontSize: 11, color: "var(--text-muted)" }}>Ctrl+Shift+K</span>
			</div>
		</div>
	);
}
