import { DataTable, type Column } from "../../components/data-table";
import { DirectionBadge, type Direction } from "../../components/badge";
import { Pagination } from "../../components/pagination";

export interface AlertRow {
	id: string;
	strategyName: string;
	symbol: string;
	direction: string;
	message: string;
	status: string;
	createdAt: string;
}

export interface AlertsViewProps {
	alerts: AlertRow[];
	total: number;
	page: number;
	pageSize: number;
	onPageChange?: (page: number) => void;
}

const columns: Column<AlertRow>[] = [
	{ key: "symbol", header: "Symbol", mono: true },
	{
		key: "direction",
		header: "Direction",
		render: (val) => <DirectionBadge direction={val as Direction} />,
	},
	{ key: "strategyName", header: "Strategy" },
	{ key: "message", header: "Message" },
	{ key: "status", header: "Status" },
	{ key: "createdAt", header: "Date" },
];

export function AlertsView({ alerts, total, page, pageSize, onPageChange }: AlertsViewProps) {
	return (
		<div>
			<h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 24 }}>
				Alerts
			</h1>
			<DataTable columns={columns} data={alerts} rowKey="id" emptyMessage="No alerts found" />
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
