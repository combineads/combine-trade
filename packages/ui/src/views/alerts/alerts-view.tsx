import { type Direction, DirectionBadge } from "../../components/badge";
import { type Column, DataTable } from "../../components/data-table";
import { Pagination } from "../../components/pagination";
import { getTranslations, useTranslations } from "../../i18n";
import type { Locale } from "../../i18n/glossary";

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
	locale?: Locale;
}

export function AlertsView({ alerts, total, page, pageSize, onPageChange, locale }: AlertsViewProps) {
	// When locale is explicitly provided use getTranslations so SSR works with correct locale.
	// Otherwise fall back to context-based useTranslations.
	const tContext = useTranslations("alerts");
	const t = locale ? getTranslations("alerts", locale) : tContext;

	const columns: Column<AlertRow>[] = [
		{ key: "symbol", header: t("columns.symbol"), mono: true },
		{
			key: "direction",
			header: t("columns.direction"),
			render: (val) => <DirectionBadge direction={val as Direction} />,
		},
		{ key: "strategyName", header: t("columns.strategy") },
		{ key: "message", header: t("columns.message") },
		{ key: "status", header: t("columns.status") },
		{ key: "createdAt", header: t("columns.date") },
	];

	return (
		<div>
			<h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 24 }}>
				{t("pageTitle")}
			</h1>
			<DataTable columns={columns} data={alerts} rowKey="id" emptyMessage={t("empty")} />
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
