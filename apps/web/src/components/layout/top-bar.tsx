"use client";

export function TopBar() {
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
