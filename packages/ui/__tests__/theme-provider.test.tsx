import { describe, expect, test, beforeEach } from "bun:test";
import { renderToString } from "react-dom/server";
import { ThemeProvider, ThemeContext, type Theme } from "../src/theme/theme-provider.js";

// Since we can't use a full DOM testing library, we test the logic through SSR rendering
// and direct context value inspection

describe("ThemeProvider", () => {
	test("renders children", () => {
		const html = renderToString(
			<ThemeProvider defaultTheme="dark">
				<div data-testid="child">Hello</div>
			</ThemeProvider>,
		);
		expect(html).toContain("Hello");
		expect(html).toContain("data-testid");
	});

	test("provides default dark theme", () => {
		let capturedTheme: Theme | null = null;

		renderToString(
			<ThemeProvider defaultTheme="dark">
				<ThemeContext.Consumer>
					{(value) => {
						capturedTheme = value?.theme ?? null;
						return <span>{value?.theme}</span>;
					}}
				</ThemeContext.Consumer>
			</ThemeProvider>,
		);

		expect(capturedTheme).toBe("dark");
	});

	test("accepts light theme override", () => {
		let capturedTheme: Theme | null = null;

		renderToString(
			<ThemeProvider defaultTheme="light">
				<ThemeContext.Consumer>
					{(value) => {
						capturedTheme = value?.theme ?? null;
						return <span>{value?.theme}</span>;
					}}
				</ThemeContext.Consumer>
			</ThemeProvider>,
		);

		expect(capturedTheme).toBe("light");
	});

	test("provides setTheme and toggleTheme functions", () => {
		let hasSetTheme = false;
		let hasToggleTheme = false;

		renderToString(
			<ThemeProvider defaultTheme="dark">
				<ThemeContext.Consumer>
					{(value) => {
						hasSetTheme = typeof value?.setTheme === "function";
						hasToggleTheme = typeof value?.toggleTheme === "function";
						return null;
					}}
				</ThemeContext.Consumer>
			</ThemeProvider>,
		);

		expect(hasSetTheme).toBe(true);
		expect(hasToggleTheme).toBe(true);
	});

	test("context is null outside provider", () => {
		let contextValue: unknown = "not-null";

		renderToString(
			<ThemeContext.Consumer>
				{(value) => {
					contextValue = value;
					return null;
				}}
			</ThemeContext.Consumer>,
		);

		expect(contextValue).toBeNull();
	});
});

describe("useTheme", () => {
	test("module exports correctly", async () => {
		const mod = await import("../src/theme/use-theme.js");
		expect(typeof mod.useTheme).toBe("function");
	});
});

describe("CSS globals", () => {
	test("globals.css file exists and contains design tokens", async () => {
		const fs = await import("node:fs");
		const path = await import("node:path");
		const cssPath = path.resolve(import.meta.dir, "../src/globals.css");
		const css = fs.readFileSync(cssPath, "utf-8");

		// Theme-invariant tokens
		expect(css).toContain("--color-primary: #22C55E");
		expect(css).toContain("--color-secondary: #EF4444");
		expect(css).toContain("--color-warning: #F59E0B");
		expect(css).toContain("--color-neutral: #64748B");
		expect(css).toContain("--font-sans:");
		expect(css).toContain("--font-mono:");

		// Dark theme tokens
		expect(css).toContain('[data-theme="dark"]');
		expect(css).toContain("--bg-base: #0A0A0F");
		expect(css).toContain("--bg-card: #12121A");

		// Light theme tokens
		expect(css).toContain('[data-theme="light"]');
		expect(css).toContain("--bg-base: #F8FAFC");
		expect(css).toContain("--bg-card: #FFFFFF");

		// Trading decision tokens
		expect(css).toContain("--color-long: #22C55E");
		expect(css).toContain("--color-short: #EF4444");
		expect(css).toContain("--color-pass: #64748B");

		// OS preference fallback
		expect(css).toContain("prefers-color-scheme: dark");
		expect(css).toContain("prefers-color-scheme: light");
	});
});

describe("barrel exports", () => {
	test("index exports ThemeProvider and useTheme", async () => {
		const mod = await import("../src/index.js");
		expect(typeof mod.ThemeProvider).toBe("function");
		expect(typeof mod.useTheme).toBe("function");
		expect(mod.ThemeContext).toBeDefined();
	});
});
