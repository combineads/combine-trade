import { type Column, DataTable } from "../../components/data-table";
import { Pagination } from "../../components/pagination";
import { useTranslations, type Locale } from "../../i18n";

export interface OrderRow {
	id: string;
	symbol: string;
	side: string;
	type: string;
	status: string;
	quantity: number;
	price: number;
	strategyName: string;
	createdAt: string;
}

export interface OrdersViewProps {
	orders: OrderRow[];
	total: number;
	page: number;
	pageSize: number;
	onPageChange?: (page: number) => void;
	locale?: Locale;
}

export function OrdersView({ orders, total, page, pageSize, onPageChange, locale }: OrdersViewProps) {
	const t = useTranslations("orders", locale);

	const columns: Column<OrderRow>[] = [
		{ key: "symbol", header: t("columns.symbol"), mono: true },
		{ key: "side", header: t("columns.side") },
		{ key: "type", header: t("columns.type") },
		{ key: "status", header: t("columns.status") },
		{ key: "quantity", header: t("columns.quantity"), align: "right", mono: true },
		{ key: "price", header: t("columns.price"), align: "right", mono: true },
		{ key: "strategyName", header: t("columns.strategy") },
		{ key: "createdAt", header: t("columns.date") },
	];

	return (
		<div>
			<h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 24 }}>
				{t("pageTitle")}
			</h1>
			<DataTable columns={columns} data={orders} rowKey="id" emptyMessage={t("noOrders")} />
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
