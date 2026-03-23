export interface SettingsViewProps {
	theme?: "dark" | "light";
	onThemeChange?: (theme: "dark" | "light") => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div
			style={{
				backgroundColor: "var(--bg-elevated)",
				borderRadius: "var(--radius-md)",
				padding: 20,
			}}
		>
			<h2
				style={{
					fontSize: 15,
					fontWeight: 600,
					color: "var(--text-primary)",
					margin: "0 0 16px 0",
				}}
			>
				{title}
			</h2>
			{children}
		</div>
	);
}

export function SettingsView({ theme = "dark", onThemeChange }: SettingsViewProps) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
			<h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
				Settings
			</h1>

			<Section title="Appearance">
				<div style={{ display: "flex", gap: 8 }}>
					{(["dark", "light"] as const).map((t) => {
						const isActive = t === theme;
						return (
							<button
								key={t}
								type="button"
								onClick={() => onThemeChange?.(t)}
								style={{
									padding: "8px 20px",
									fontSize: 13,
									fontWeight: isActive ? 600 : 400,
									borderRadius: "var(--radius-md)",
									border: "1px solid",
									borderColor: isActive ? "#22C55E" : "var(--border-subtle)",
									backgroundColor: isActive ? "rgba(34,197,94,0.1)" : "transparent",
									color: isActive ? "#22C55E" : "var(--text-secondary)",
									cursor: "pointer",
									textTransform: "capitalize",
								}}
							>
								{t.charAt(0).toUpperCase() + t.slice(1)}
							</button>
						);
					})}
				</div>
			</Section>

			<Section title="General">
				<p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
					General settings coming soon.
				</p>
			</Section>

			<Section title="Exchange">
				<p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
					Exchange configuration managed in Credentials.
				</p>
			</Section>
		</div>
	);
}
