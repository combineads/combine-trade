import { type Direction, DirectionBadge } from "../../components/badge";
import { type Column, DataTable } from "../../components/data-table";
import { Pagination } from "../../components/pagination";
import { useTranslations } from "../../i18n";

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

export function EventsView({ events, total, page, pageSize, onPageChange }: EventsViewProps) {
	const t = useTranslations("events");

	const columns: Column<EventRow>[] = [
		{ key: "symbol", header: t("columns.symbol"), mono: true },
		{
			key: "direction",
			header: t("columns.direction"),
			render: (val) => <DirectionBadge direction={val as Direction} />,
		},
		{ key: "strategyName", header: t("columns.strategy") },
		{
			key: "winrate",
			header: t("columns.winrate"),
			align: "right",
			mono: true,
			render: (val) => `${((val as number) * 100).toFixed(1)}%`,
		},
		{ key: "decision", header: t("columns.decision") },
		{ key: "createdAt", header: t("columns.date") },
	];

	return (
		<div>
			<h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 24 }}>
				{t("pageTitle")}
			</h1>
			<DataTable columns={columns} data={events} rowKey="id" emptyMessage={t("noEvents")} />
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
