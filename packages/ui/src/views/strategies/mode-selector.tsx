export type ExecutionMode = "analysis" | "alert" | "paper-trade" | "auto-trade";

export interface ModeSelectorProps {
	currentMode: ExecutionMode;
	onModeChange: (mode: ExecutionMode) => void;
}

const MODES: ExecutionMode[] = ["analysis", "alert", "paper-trade", "auto-trade"];

export function ModeSelector({ currentMode, onModeChange }: ModeSelectorProps) {
	return (
		<div style={{ display: "flex", gap: 4 }}>
			{MODES.map((mode) => {
				const isActive = mode === currentMode;
				return (
					<button
						key={mode}
						type="button"
						onClick={() => onModeChange(mode)}
						style={{
							padding: "6px 12px",
							borderRadius: "var(--radius-sm)",
							border: "1px solid",
							borderColor: isActive ? "#22C55E" : "var(--border-subtle)",
							backgroundColor: isActive ? "rgba(34,197,94,0.1)" : "transparent",
							color: isActive ? "#22C55E" : "var(--text-secondary)",
							fontSize: 12,
							fontWeight: isActive ? 600 : 400,
							cursor: "pointer",
						}}
					>
						{mode}
					</button>
				);
			})}
		</div>
	);
}
