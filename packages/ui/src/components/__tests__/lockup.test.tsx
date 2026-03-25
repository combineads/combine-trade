import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { ThemeProvider } from "../../theme/theme-provider";
import { Lockup } from "../lockup";

function renderWithTheme(ui: React.ReactElement, theme: "dark" | "light" = "dark") {
	return renderToString(<ThemeProvider defaultTheme={theme}>{ui}</ThemeProvider>);
}

describe("Lockup", () => {
	test("renders Logo component inside", () => {
		const html = renderWithTheme(<Lockup />);
		// Logo renders an SVG with these brand-color paths
		expect(html).toContain("<svg");
		expect(html).toContain("#22C55E");
		expect(html).toContain("#EF4444");
	});

	test('renders "Combine" text span with green color', () => {
		const html = renderWithTheme(<Lockup />);
		expect(html).toContain("Combine");
		expect(html).toContain("color:#22C55E");
	});

	test('renders "Trade" text span', () => {
		const html = renderWithTheme(<Lockup />);
		expect(html).toContain("Trade");
	});

	test('"Trade" text uses light color on dark theme', () => {
		const html = renderWithTheme(<Lockup />, "dark");
		// Trade text should be #E2E8F0 on dark theme
		expect(html).toContain("color:#E2E8F0");
	});

	test('"Trade" text uses dark color on light theme', () => {
		const html = renderWithTheme(<Lockup />, "light");
		// Trade text should be #1E293B on light theme
		expect(html).toContain("color:#1E293B");
	});

	test("explicit dark variant overrides theme", () => {
		// Even if theme is light, variant="dark" should use dark colors
		const html = renderWithTheme(<Lockup variant="dark" />, "light");
		expect(html).toContain("color:#E2E8F0");
	});

	test("explicit light variant overrides theme", () => {
		const html = renderWithTheme(<Lockup variant="light" />, "dark");
		expect(html).toContain("color:#1E293B");
	});

	test("default size is md (icon 32px)", () => {
		const html = renderWithTheme(<Lockup />);
		expect(html).toContain('width="32"');
		expect(html).toContain('height="32"');
	});

	test("sm size renders icon at 24px", () => {
		const html = renderWithTheme(<Lockup size="sm" />);
		expect(html).toContain('width="24"');
		expect(html).toContain('height="24"');
	});

	test("lg size renders icon at 48px", () => {
		const html = renderWithTheme(<Lockup size="lg" />);
		expect(html).toContain('width="48"');
		expect(html).toContain('height="48"');
	});

	test("sm size uses smaller text", () => {
		const html = renderWithTheme(<Lockup size="sm" />);
		expect(html).toContain("font-size:16px");
	});

	test("md size uses medium text", () => {
		const html = renderWithTheme(<Lockup size="md" />);
		expect(html).toContain("font-size:20px");
	});

	test("lg size uses larger text", () => {
		const html = renderWithTheme(<Lockup size="lg" />);
		expect(html).toContain("font-size:28px");
	});

	test("passes through className", () => {
		const html = renderWithTheme(<Lockup className="my-lockup" />);
		expect(html).toContain("my-lockup");
	});

	test("renders as a div element", () => {
		const html = renderWithTheme(<Lockup />);
		expect(html).toContain("<div");
	});

	test("has horizontal flex layout", () => {
		const html = renderWithTheme(<Lockup />);
		expect(html).toContain("display:flex");
		expect(html).toContain("align-items:center");
	});

	test('"Combine" has font-weight 600', () => {
		const html = renderWithTheme(<Lockup />);
		// Find the Combine span and check its weight
		expect(html).toContain("font-weight:600");
	});

	test('"Trade" has font-weight 400', () => {
		const html = renderWithTheme(<Lockup />);
		expect(html).toContain("font-weight:400");
	});
});
