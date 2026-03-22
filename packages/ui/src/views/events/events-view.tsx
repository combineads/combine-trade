import { DataTable, type Column } from "../../components/data-table";
import { DirectionBadge, type Direction } from "../../components/badge";
import { Pagination } from "../../components/pagination";

export interface EventRow {
	id: string;
	symbol: string;
	direction: string;
	strategyName: string;
	winrate: number;
	decision: string;
	createdAt: string;
}

export interface EventsViewProps {
	events: EventRow[];
	total: number;
	page: number;
	pageSize: number;
	onPageChange?: (page: number) => void;
}

const columns: Column<EventRow>[] = [
	{ key: "symbol", header: "Symbol", mono: true },
	{
		key: "direction",
		header: "Direction",
		render: (val) => <DirectionBadge direction={val as Direction} />,
	},
	{ key: "strategyName", header: "Strategy" },
	{
		key: "winrate",
		header: "Winrate",
		align: "right",
		mono: true,
		render: (val) => `${((val as number) * 100).toFixed(1)}%`,
	},
	{ key: "decision", header: "Decision" },
	{ key: "createdAt", header: "Date" },
];

export function EventsView({ events, total, page, pageSize, onPageChange }: EventsViewProps) {
	return (
		<div>
			<h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 24 }}>
				Events
			</h1>
			<DataTable columns={columns} data={events} rowKey="id" emptyMessage="No events found" />
			{total > pageSize && (
				<div style={{ marginTop: 16 }}>
					<Pagination
						page={page}
						pageSize={pageSize}
						total={total}
						onPageChange={onPageChange ?? (() => {})}
					/>
				</div>
			)}
		</div>
	);
}
