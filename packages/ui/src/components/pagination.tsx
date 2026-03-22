export interface PaginationProps {
	page: number;
	pageSize: number;
	total: number;
	onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				padding: "12px 0",
				fontSize: 14,
				fontFamily: "var(--font-sans)",
				color: "var(--text-secondary)",
			}}
		>
			<span>
				Page {page} of {totalPages} ({total} total)
			</span>
			<div style={{ display: "flex", gap: 8 }}>
				<button
					type="button"
					disabled={page <= 1}
					onClick={() => onPageChange(page - 1)}
					style={{
						padding: "4px 12px",
						borderRadius: "var(--radius-sm)",
						border: "1px solid var(--border-subtle)",
						backgroundColor: "transparent",
						color: "var(--text-secondary)",
						cursor: page <= 1 ? "not-allowed" : "pointer",
						opacity: page <= 1 ? 0.5 : 1,
						fontSize: 13,
					}}
				>
					Previous
				</button>
				<button
					type="button"
					disabled={page >= totalPages}
					onClick={() => onPageChange(page + 1)}
					style={{
						padding: "4px 12px",
						borderRadius: "var(--radius-sm)",
						border: "1px solid var(--border-subtle)",
						backgroundColor: "transparent",
						color: "var(--text-secondary)",
						cursor: page >= totalPages ? "not-allowed" : "pointer",
						opacity: page >= totalPages ? 0.5 : 1,
						fontSize: 13,
					}}
				>
					Next
				</button>
			</div>
		</div>
	);
}
