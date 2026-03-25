import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { Logo } from "../logo";

describe("Logo", () => {
	test("renders an SVG element", () => {
		const html = renderToString(<Logo />);
		expect(html).toContain("<svg");
		expect(html).toContain("</svg>");
	});

	test("default size is 32", () => {
		const html = renderToString(<Logo />);
		expect(html).toContain('width="32"');
		expect(html).toContain('height="32"');
	});

	test("respects custom size prop", () => {
		const html = renderToString(<Logo size={48} />);
		expect(html).toContain('width="48"');
		expect(html).toContain('height="48"');
	});

	test("has correct viewBox", () => {
		const html = renderToString(<Logo />);
		expect(html).toContain("0 0 200 200");
	});

	test("has red descending path (drawn first, behind)", () => {
		const html = renderToString(<Logo />);
		expect(html).toContain("#EF4444");
		expect(html).toContain("M 30,55 C 82,55 118,145 170,145");
	});

	test("has green ascending path (drawn second, on top)", () => {
		const html = renderToString(<Logo />);
		expect(html).toContain("#22C55E");
		expect(html).toContain("M 30,145 C 82,145 118,55 170,55");
	});

	test("paths have correct stroke attributes", () => {
		const html = renderToString(<Logo />);
		expect(html).toContain('stroke-width="22"');
		expect(html).toContain('stroke-linecap="round"');
		expect(html).toContain('fill="none"');
	});

	test("green path appears after red path in DOM (renders on top)", () => {
		const html = renderToString(<Logo />);
		const redIndex = html.indexOf("#EF4444");
		const greenIndex = html.indexOf("#22C55E");
		expect(redIndex).toBeGreaterThan(-1);
		expect(greenIndex).toBeGreaterThan(-1);
		expect(greenIndex).toBeGreaterThan(redIndex);
	});

	test("passes through className", () => {
		const html = renderToString(<Logo className="my-logo" />);
		expect(html).toContain("my-logo");
	});

	test("colors are the same regardless of variant", () => {
		const darkHtml = renderToString(<Logo variant="dark" />);
		const lightHtml = renderToString(<Logo variant="light" />);
		// Both variants use the same brand colors
		expect(darkHtml).toContain("#EF4444");
		expect(darkHtml).toContain("#22C55E");
		expect(lightHtml).toContain("#EF4444");
		expect(lightHtml).toContain("#22C55E");
	});
});
