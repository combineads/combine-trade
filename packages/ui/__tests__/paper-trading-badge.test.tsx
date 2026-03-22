import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { PaperTradingBanner, PaperBadge, PaperOrderCard } from "../src/components/paper-trading-badge";

describe("PaperTradingBanner", () => {
	test("renders nothing when inactive", () => {
		const html = renderToString(<PaperTradingBanner active={false} />);
		expect(html).toBe("");
	});

	test("renders banner when active", () => {
		const html = renderToString(<PaperTradingBanner active />);
		expect(html).toContain("Paper Trading Active");
	});

	test("includes strategy name when provided", () => {
		const html = renderToString(<PaperTradingBanner active strategyName="Momentum v3" />);
		expect(html).toContain("Momentum v3");
		expect(html).toContain("Paper Trading Active");
	});
});

describe("PaperBadge", () => {
	test("renders PAPER text", () => {
		const html = renderToString(<PaperBadge />);
		expect(html).toContain("PAPER");
	});
});

describe("PaperOrderCard", () => {
	test("renders children", () => {
		const html = renderToString(<PaperOrderCard><span>Order #1</span></PaperOrderCard>);
		expect(html).toContain("Order #1");
	});

	test("applies dashed border when isPaper", () => {
		const html = renderToString(<PaperOrderCard isPaper><span>Order</span></PaperOrderCard>);
		expect(html).toContain("dashed");
	});

	test("no dashed border when not paper", () => {
		const html = renderToString(<PaperOrderCard><span>Order</span></PaperOrderCard>);
		expect(html).not.toContain("dashed");
	});
});
