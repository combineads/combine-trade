export interface LoginViewProps {
	onSubmit: (username: string, password: string) => Promise<void>;
	error?: string;
	loading?: boolean;
}

export function LoginView({ onSubmit, error, loading }: LoginViewProps) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				minHeight: "100vh",
				backgroundColor: "var(--bg-base)",
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
				<h1
					style={{
						fontSize: 24,
						fontWeight: 700,
						color: "var(--color-primary)",
						textAlign: "center",
						marginBottom: 8,
					}}
				>
					Combine Trade
				</h1>
				<p
					style={{
						fontSize: 13,
						color: "var(--text-muted)",
						textAlign: "center",
						marginBottom: 24,
					}}
				>
					AES-256-GCM encrypted credentials
				</p>

				{error && (
					<div
						style={{
							padding: "8px 12px",
							marginBottom: 16,
							borderRadius: "var(--radius-sm)",
							borderLeft: "3px solid #EF4444",
							backgroundColor: "rgba(239,68,68,0.06)",
							color: "#EF4444",
							fontSize: 13,
						}}
					>
						{error}
					</div>
				)}

				<form
					onSubmit={(e) => {
						e.preventDefault();
						const form = e.currentTarget;
						const formData = new FormData(form);
						const username = formData.get("username") as string;
						const password = formData.get("password") as string;
						onSubmit(username, password);
					}}
				>
					<div style={{ marginBottom: 16 }}>
						<label
							htmlFor="username"
							style={{
								display: "block",
								fontSize: 13,
								fontWeight: 500,
								color: "var(--text-secondary)",
								marginBottom: 6,
							}}
						>
							Username
						</label>
						<input
							id="username"
							name="username"
							type="text"
							required
							autoComplete="username"
							style={{
								width: "100%",
								padding: "8px 12px",
								borderRadius: "var(--radius-md)",
								border: "1px solid var(--border-default)",
								backgroundColor: "var(--bg-card)",
								color: "var(--text-primary)",
								fontSize: 14,
								outline: "none",
								boxSizing: "border-box",
							}}
						/>
					</div>

					<div style={{ marginBottom: 24 }}>
						<label
							htmlFor="password"
							style={{
								display: "block",
								fontSize: 13,
								fontWeight: 500,
								color: "var(--text-secondary)",
								marginBottom: 6,
							}}
						>
							Password
						</label>
						<input
							id="password"
							name="password"
							type="password"
							required
							autoComplete="current-password"
							style={{
								width: "100%",
								padding: "8px 12px",
								borderRadius: "var(--radius-md)",
								border: "1px solid var(--border-default)",
								backgroundColor: "var(--bg-card)",
								color: "var(--text-primary)",
								fontSize: 14,
								outline: "none",
								boxSizing: "border-box",
							}}
						/>
					</div>

					<button
						type="submit"
						disabled={loading}
						style={{
							width: "100%",
							padding: "10px 16px",
							borderRadius: "var(--radius-md)",
							backgroundColor: "var(--color-primary)",
							color: "white",
							border: "none",
							fontWeight: 600,
							fontSize: 14,
							cursor: loading ? "not-allowed" : "pointer",
							opacity: loading ? 0.7 : 1,
						}}
					>
						{loading ? "Signing in..." : "Sign In"}
					</button>
				</form>
			</div>
		</div>
	);
}
