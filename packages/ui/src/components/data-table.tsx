export interface Column<T> {
	key: keyof T & string;
	header: string;
	align?: "left" | "right" | "center";
	mono?: boolean;
	render?: (value: T[keyof T], row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
	columns: Column<T>[];
	data: T[];
	rowKey: keyof T & string;
	emptyMessage?: string;
}

const headerCellStyle: React.CSSProperties = {
	padding: "8px 12px",
	fontSize: 11,
	fontWeight: 600,
	textTransform: "uppercase",
	letterSpacing: "0.05em",
	color: "var(--text-muted)",
	borderBottom: "1px solid var(--border-subtle)",
	backgroundColor: "var(--bg-elevated)",
};

export function DataTable<T>({ columns, data, rowKey, emptyMessage }: DataTableProps<T>) {
	if (data.length === 0) {
		return (
			<div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)", fontSize: 14 }}>
				{emptyMessage ?? "No data"}
			</div>
		);
	}

	return (
		<div style={{ overflowX: "auto" }}>
			<table style={{ width: "100%", borderCollapse: "collapse" }}>
				<thead>
					<tr>
						{columns.map((col) => (
							<th
								key={col.key}
								style={{
									...headerCellStyle,
									textAlign: col.align ?? "left",
								}}
							>
								{col.header}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{data.map((row, i) => (
						<tr
							key={String(row[rowKey])}
							style={{
								backgroundColor: i % 2 === 0 ? "var(--bg-card)" : "var(--bg-elevated)",
							}}
						>
							{columns.map((col) => (
								<td
									key={col.key}
									style={{
										padding: "8px 12px",
										fontSize: 13,
										textAlign: col.align ?? "left",
										fontFamily: col.mono ? "var(--font-mono)" : undefined,
										color: "var(--text-primary)",
										borderBottom: "1px solid var(--border-subtle)",
									}}
								>
									{col.render
										? col.render(row[col.key], row)
										: String(row[col.key] ?? "")}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
