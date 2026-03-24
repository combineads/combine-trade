import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { type Column, DataTable } from "../src/components/data-table";
import { FilterBar, type FilterOption } from "../src/components/filter-bar";
import { type AlertRow, AlertsView } from "../src/views/alerts/alerts-view";
import { type EventRow, EventsView } from "../src/views/events/events-view";
import { type OrderRow, OrdersView } from "../src/views/orders/orders-view";

describe("DataTable", () => {
	const columns: Column<{ id: string; name: string; value: number }>[] = [
		{ key: "name", header: "Name" },
		{ key: "value", header: "Value", align: "right", mono: true },
	];
	const data = [
		{ id: "1", name: "Alpha", value: 100 },
		{ id: "2", name: "Beta", value: 200 },
	];

	test("renders column headers", () => {
		const html = renderToString(<DataTable columns={columns} data={data} rowKey="id" />);
		expect(html).toContain("Name");
		expect(html).toContain("Value");
	});

	test("renders row data", () => {
		const html = renderToString(<DataTable columns={columns} data={data} rowKey="id" />);
		expect(html).toContain("Alpha");
		expect(html).toContain("200");
	});

	test("renders empty state", () => {
		const html = renderToString(
			<DataTable columns={columns} data={[]} rowKey="id" emptyMessage="No data" />,
		);
		expect(html).toContain("No data");
	});
});

describe("FilterBar", () => {
	const filters: FilterOption[] = [
		{ key: "status", label: "Status", options: ["active", "filled", "cancelled"] },
		{ key: "direction", label: "Direction", options: ["LONG", "SHORT", "PASS"] },
	];

	test("renders filter labels", () => {
		const html = renderToString(<FilterBar filters={filters} values={{}} onChange={() => {}} />);
		expect(html).toContain("Status");
		expect(html).toContain("Direction");
	});

	test("renders filter options", () => {
		const html = renderToString(<FilterBar filters={filters} values={{}} onChange={() => {}} />);
		expect(html).toContain("active");
		expect(html).toContain("LONG");
	});
});

describe("EventsView", () => {
	const events: EventRow[] = [
		{
			id: "e1",
			symbol: "BTCUSDT",
			direction: "LONG",
			strategyName: "Momentum v3",
			winrate: 0.65,
			decision: "LONG",
			createdAt: "2026-03-22T10:00:00Z",
		},
	];

	test("renders events heading (Korean default)", () => {
		const html = renderToString(<EventsView events={events} total={1} page={1} pageSize={20} />);
		expect(html).toContain("이벤트");
	});

	test("renders event data", () => {
		const html = renderToString(<EventsView events={events} total={1} page={1} pageSize={20} />);
		expect(html).toContain("BTCUSDT");
		expect(html).toContain("Momentum v3");
		expect(html).toContain("LONG");
	});

	test("renders empty state (Korean default)", () => {
		const html = renderToString(<EventsView events={[]} total={0} page={1} pageSize={20} />);
		expect(html).toContain("이벤트가 없습니다");
	});
});

describe("OrdersView", () => {
	const orders: OrderRow[] = [
		{
			id: "o1",
			symbol: "ETHUSDT",
			side: "buy",
			type: "market",
			status: "filled",
			quantity: 0.5,
			price: 3200,
			strategyName: "Momentum v3",
			createdAt: "2026-03-22T10:00:00Z",
		},
	];

	test("renders orders heading", () => {
		const html = renderToString(<OrdersView orders={orders} total={1} page={1} pageSize={20} locale="en" />);
		expect(html).toContain("Orders");
	});

	test("renders order data", () => {
		const html = renderToString(<OrdersView orders={orders} total={1} page={1} pageSize={20} locale="en" />);
		expect(html).toContain("ETHUSDT");
		expect(html).toContain("filled");
		expect(html).toContain("3200");
	});

	test("renders empty state", () => {
		const html = renderToString(<OrdersView orders={[]} total={0} page={1} pageSize={20} locale="en" />);
		expect(html).toContain("No orders");
	});
});

describe("AlertsView", () => {
	const alerts: AlertRow[] = [
		{
			id: "a1",
			strategyName: "Momentum v3",
			symbol: "BTCUSDT",
			direction: "LONG",
			message: "Entry signal detected",
			status: "sent",
			createdAt: "2026-03-22T10:00:00Z",
		},
	];

	test("renders alerts heading", () => {
		const html = renderToString(<AlertsView alerts={alerts} total={1} page={1} pageSize={20} locale="en" />);
		expect(html).toContain("Alerts");
	});

	test("renders alert data", () => {
		const html = renderToString(<AlertsView alerts={alerts} total={1} page={1} pageSize={20} locale="en" />);
		expect(html).toContain("BTCUSDT");
		expect(html).toContain("Entry signal detected");
		expect(html).toContain("sent");
	});

	test("renders empty state", () => {
		const html = renderToString(<AlertsView alerts={[]} total={0} page={1} pageSize={20} locale="en" />);
		expect(html).toContain("No alerts");
	});
});
