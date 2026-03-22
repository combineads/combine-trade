export default function LoginPage() {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				minHeight: "100vh",
			}}
		>
			<div
				style={{
					backgroundColor: "var(--bg-card)",
					border: "1px solid var(--border-subtle)",
					borderRadius: "var(--radius-lg)",
					padding: 32,
					width: 400,
				}}
			>
				<h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, textAlign: "center" }}>
					Combine Trade
				</h1>
				<p style={{ color: "var(--text-secondary)", textAlign: "center" }}>
					Login form — coming soon.
				</p>
			</div>
		</div>
	);
}
