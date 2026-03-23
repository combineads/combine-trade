export interface FilterOption {
	key: string;
	label: string;
	options: string[];
}

export interface FilterBarProps {
	filters: FilterOption[];
	values: Record<string, string>;
	onChange: (key: string, value: string) => void;
}

export function FilterBar({ filters, values, onChange }: FilterBarProps) {
	return (
		<div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
			{filters.map((filter) => (
				<div key={filter.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
					<label
						htmlFor={`filter-${filter.key}`}
						style={{
							fontSize: 12,
							color: "var(--text-muted)",
							fontWeight: 500,
						}}
					>
						{filter.label}
					</label>
					<select
						id={`filter-${filter.key}`}
						value={values[filter.key] ?? ""}
						onChange={(e) => onChange(filter.key, e.target.value)}
						style={{
							padding: "4px 8px",
							fontSize: 12,
							borderRadius: "var(--radius-sm)",
							border: "1px solid var(--border-subtle)",
							backgroundColor: "var(--bg-card)",
							color: "var(--text-primary)",
						}}
					>
						<option value="">All</option>
						{filter.options.map((opt) => (
							<option key={opt} value={opt}>
								{opt}
							</option>
						))}
					</select>
				</div>
			))}
		</div>
	);
}
