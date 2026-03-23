import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { DirectionBadge, StatusBadge } from "../src/components/badge";
import { Button } from "../src/components/button";
import { Card } from "../src/components/card";
import { Pagination } from "../src/components/pagination";
import { Skeleton } from "../src/components/skeleton";

describe("Button", () => {
	test("renders primary variant", () => {
		const html = renderToString(<Button variant="primary">Save</Button>);
		expect(html).toContain("Save");
		expect(html).toContain("#22C55E");
	});

	test("renders secondary variant", () => {
		const html = renderToString(<Button variant="secondary">Cancel</Button>);
		expect(html).toContain("Cancel");
		expect(html).toContain("#EF4444");
	});

	test("renders danger variant", () => {
		const html = renderToString(<Button variant="danger">Delete</Button>);
		expect(html).toContain("Delete");
		expect(html).toContain("#EF4444");
	});

	test("renders tertiary variant", () => {
		const html = renderToString(<Button variant="tertiary">Edit</Button>);
		expect(html).toContain("Edit");
	});

	test("renders disabled state", () => {
		const html = renderToString(
			<Button variant="primary" disabled>
				Save
			</Button>,
		);
		expect(html).toContain("disabled");
	});
});

describe("StatusBadge", () => {
	test("renders active badge", () => {
		const html = renderToString(<StatusBadge status="active" />);
		expect(html).toContain("active");
	});

	test("renders stopped badge", () => {
		const html = renderToString(<StatusBadge status="stopped" />);
		expect(html).toContain("stopped");
	});

	test("renders warning badge", () => {
		const html = renderToString(<StatusBadge status="warning" />);
		expect(html).toContain("warning");
	});

	test("renders draft badge", () => {
		const html = renderToString(<StatusBadge status="draft" />);
		expect(html).toContain("draft");
	});
});

describe("DirectionBadge", () => {
	test("renders LONG badge with green", () => {
		const html = renderToString(<DirectionBadge direction="LONG" />);
		expect(html).toContain("LONG");
		expect(html).toContain("#22C55E");
	});

	test("renders SHORT badge with red", () => {
		const html = renderToString(<DirectionBadge direction="SHORT" />);
		expect(html).toContain("SHORT");
		expect(html).toContain("#EF4444");
	});

	test("renders PASS badge with neutral", () => {
		const html = renderToString(<DirectionBadge direction="PASS" />);
		expect(html).toContain("PASS");
		expect(html).toContain("#64748B");
	});
});

describe("Card", () => {
	test("renders default card", () => {
		const html = renderToString(<Card>Content</Card>);
		expect(html).toContain("Content");
		expect(html).toContain("var(--bg-card)");
	});

	test("renders active card with green left bar", () => {
		const html = renderToString(<Card state="active">Active</Card>);
		expect(html).toContain("#22C55E");
	});

	test("renders error card with red tint", () => {
		const html = renderToString(<Card state="error">Error</Card>);
		expect(html).toContain("rgba(239,68,68");
	});

	test("renders kill-switch card", () => {
		const html = renderToString(<Card state="kill-switch">Kill</Card>);
		expect(html).toContain("#EF4444");
	});
});

describe("Skeleton", () => {
	test("renders skeleton loader", () => {
		const html = renderToString(<Skeleton width={200} height={20} />);
		expect(html).toContain("var(--skeleton-base)");
	});

	test("renders with custom dimensions", () => {
		const html = renderToString(<Skeleton width={100} height={16} />);
		expect(html).toContain("100px");
		expect(html).toContain("16px");
	});
});

describe("Pagination", () => {
	test("renders page info", () => {
		const html = renderToString(
			<Pagination page={2} pageSize={10} total={50} onPageChange={() => {}} />,
		);
		expect(html).toContain("2");
		expect(html).toContain("5"); // total pages
	});

	test("renders page 1 of 1 for small results", () => {
		const html = renderToString(
			<Pagination page={1} pageSize={20} total={5} onPageChange={() => {}} />,
		);
		expect(html).toContain("1");
	});
});
