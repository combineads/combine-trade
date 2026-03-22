export interface TopBarProps {
	killSwitchActive?: boolean;
}

export function TopBar({ killSwitchActive }: TopBarProps) {
	return (
		<header
			style={{
				height: 48,
				backgroundColor: "var(--topbar-bg)",
				borderBottom: "1px solid var(--topbar-border)",
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				padding: "0 24px",
				fontFamily: "var(--font-sans)",
			}}
		>
			<div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
				Combine Trade
			</div>
			<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
				{killSwitchActive && (
					<span
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 6,
							fontSize: 12,
							fontWeight: 600,
							color: "#EF4444",
						}}
					>
						<span
							style={{
								width: 8,
								height: 8,
								borderRadius: "50%",
								backgroundColor: "#EF4444",
								display: "inline-block",
							}}
						/>
						Kill Switch Active
					</span>
				)}
				<span
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
						fontSize: 12,
						color: "var(--text-muted)",
					}}
				>
					<span
						style={{
							width: 8,
							height: 8,
							borderRadius: "50%",
							backgroundColor: "var(--color-primary)",
							display: "inline-block",
						}}
					/>
					Connected
				</span>
			</div>
		</header>
	);
}
