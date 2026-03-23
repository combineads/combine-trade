export interface AuditEntry {
	id: string;
	action: string;
	reason: string;
	actor: string;
	timestamp: string;
}

export interface AuditLogProps {
	entries: AuditEntry[];
}

export function AuditLog({ entries }: AuditLogProps) {
	if (entries.length === 0) {
		return (
			<div
				style={{
					textAlign: "center",
					padding: 32,
					color: "var(--text-muted)",
					fontSize: 14,
				}}
			>
				No audit events recorded
			</div>
		);
	}

	return (
		<div
			style={{
				backgroundColor: "var(--bg-card)",
				border: "1px solid var(--border-subtle)",
				borderRadius: "var(--radius-lg)",
				overflow: "hidden",
			}}
		>
			<div
				style={{
					padding: "8px 16px",
					fontSize: 11,
					fontWeight: 600,
					color: "var(--text-muted)",
					textTransform: "uppercase",
					letterSpacing: "0.05em",
					backgroundColor: "var(--bg-elevated)",
					borderBottom: "1px solid var(--border-subtle)",
				}}
			>
				Audit Log
			</div>
			{entries.map((entry, i) => (
				<div
					key={entry.id}
					style={{
						padding: "10px 16px",
						borderBottom: i < entries.length - 1 ? "1px solid var(--border-subtle)" : undefined,
						display: "flex",
						justifyContent: "space-between",
						alignItems: "flex-start",
						gap: 12,
					}}
				>
					<div style={{ flex: 1 }}>
						<div
							style={{
								fontSize: 13,
								fontWeight: 500,
								color: "var(--text-primary)",
								marginBottom: 2,
							}}
						>
							{entry.action}
						</div>
						<div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{entry.reason}</div>
					</div>
					<div style={{ textAlign: "right", flexShrink: 0 }}>
						<div
							style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
						>
							{entry.actor}
						</div>
						<div
							style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
						>
							{entry.timestamp}
						</div>
					</div>
				</div>
			))}
		</div>
	);
}
