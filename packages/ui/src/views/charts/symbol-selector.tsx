export interface SymbolSelectorProps {
	symbols: string[];
	value: string;
	onChange: (symbol: string) => void;
}

export function SymbolSelector({ symbols, value, onChange }: SymbolSelectorProps) {
	return (
		<select
			value={value}
			onChange={(e) => onChange(e.target.value)}
			style={{
				padding: "4px 8px",
				fontSize: 13,
				fontFamily: "var(--font-mono)",
				fontWeight: 600,
				backgroundColor: "var(--bg-elevated)",
				color: "var(--text-primary)",
				border: "1px solid var(--border-subtle)",
				borderRadius: "var(--radius-sm)",
				cursor: "pointer",
			}}
		>
			{symbols.map((s) => (
				<option key={s} value={s}>
					{s}
				</option>
			))}
		</select>
	);
}
