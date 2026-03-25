import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";

// Mock next/navigation
const mock = require("bun:test").mock;
mock.module("next/navigation", () => ({
	usePathname: () => "/dashboard",
}));

// Mock next/link to render a plain anchor
mock.module("next/link", () => ({
	default: ({
		href,
		children,
		style,
	}: {
		href: string;
		children: React.ReactNode;
		style?: React.CSSProperties;
	}) => {
		return (
			<a href={href} style={style}>
				{children}
			</a>
		);
	},
}));

import { Sidebar } from "../sidebar";

describe("Sidebar", () => {
	test("renders Logo SVG component at the top", () => {
		const html = renderToString(<Sidebar />);
		// Logo renders an SVG with brand colors
		expect(html).toContain("<svg");
		expect(html).toContain('width="28"');
		expect(html).toContain('height="28"');
		// Green ascending path from Logo
		expect(html).toContain("#22C55E");
	});

	test('renders "Combine Trade" text in header', () => {
		const html = renderToString(<Sidebar />);
		expect(html).toContain("Combine Trade");
	});

	test("renders navigation sections", () => {
		const html = renderToString(<Sidebar />);
		expect(html).toContain("OVERVIEW");
		expect(html).toContain("TRADING");
		expect(html).toContain("SYSTEM");
	});
});
