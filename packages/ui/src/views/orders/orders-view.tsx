import { type Column, DataTable } from "../../components/data-table";
import { Pagination } from "../../components/pagination";

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
}

const columns: Column<OrderRow>[] = [
	{ key: "symbol", header: "Symbol", mono: true },
	{ key: "side", header: "Side" },
	{ key: "type", header: "Type" },
	{ key: "status", header: "Status" },
	{ key: "quantity", header: "Qty", align: "right", mono: true },
	{ key: "price", header: "Price", align: "right", mono: true },
	{ key: "strategyName", header: "Strategy" },
	{ key: "createdAt", header: "Date" },
];

export function OrdersView({ orders, total, page, pageSize, onPageChange }: OrdersViewProps) {
	return (
		<div>
			<h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", marginBottom: 24 }}>
				Orders
			</h1>
			<DataTable columns={columns} data={orders} rowKey="id" emptyMessage="No orders found" />
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
