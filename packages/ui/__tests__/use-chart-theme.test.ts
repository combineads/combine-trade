import { describe, expect, test } from "bun:test";

// RED phase: tests drive the shape of useChartTheme
// These tests verify module exports and the data structure produced by the hook.
// DOM hooks are tested via SSR-compatible patterns (no window/document).

describe("useChartTheme — module exports", () => {
	test("exports useChartTheme function", async () => {
		const mod = await import("../src/hooks/use-chart-theme.js");
		expect(typeof mod.useChartTheme).toBe("function");
	});

	test("exports CHART_THEMES constant", async () => {
		const mod = await import("../src/hooks/use-chart-theme.js");
		expect(mod.CHART_THEMES).toBeDefined();
		expect(typeof mod.CHART_THEMES).toBe("object");
	});

	test("exports ChartTheme type via CHART_THEMES shape", async () => {
		const mod = await import("../src/hooks/use-chart-theme.js");
		expect(mod.CHART_THEMES.dark).toBeDefined();
		expect(mod.CHART_THEMES.light).toBeDefined();
	});
});

describe("CHART_THEMES.dark", () => {
	test("has correct background color", async () => {
		const { CHART_THEMES } = await import("../src/hooks/use-chart-theme.js");
		expect(CHART_THEMES.dark.background).toBe("#0A0A0F");
	});

	test("has correct grid color", async () => {
		const { CHART_THEMES } = await import("../src/hooks/use-chart-theme.js");
		expect(CHART_THEMES.dark.grid).toBe("#1E293B");
	});

	test("has correct crosshair color", async () => {
		const { CHART_THEMES } = await import("../src/hooks/use-chart-theme.js");
		expect(CHART_THEMES.dark.crosshair).toBe("#334155");
	});

	test("has correct price scale text color", async () => {
		const { CHART_THEMES } = await import("../src/hooks/use-chart-theme.js");
		expect(CHART_THEMES.dark.scaleText).toBe("#94A3B8");
	});

	test("has theme-invariant bullish candle color", async () => {
		const { CHART_THEMES } = await import("../src/hooks/use-chart-theme.js");
		expect(CHART_THEMES.dark.bullish).toBe("#22C55E");
	});

	test("has theme-invariant bearish candle color", async () => {
		const { CHART_THEMES } = await import("../src/hooks/use-chart-theme.js");
		expect(CHART_THEMES.dark.bearish).toBe("#EF4444");
	});

	test("has series colors", async () => {
		const { CHART_THEMES } = await import("../src/hooks/use-chart-theme.js");
		expect(CHART_THEMES.dark.sma).toBe("#3B82F6");
		expect(CHART_THEMES.dark.ema).toBe("#8B5CF6");
		expect(CHART_THEMES.dark.bbLine).toBe("#64748B");
		expect(CHART_THEMES.dark.bbFill).toBe("rgba(100,116,139,0.06)");
	});
});

describe("CHART_THEMES.light", () => {
	test("has correct background color", async () => {
		const { CHART_THEMES } = await import("../src/hooks/use-chart-theme.js");
		expect(CHART_THEMES.light.background).toBe("#FFFFFF");
	});

	test("has correct grid color", async () => {
		const { CHART_THEMES } = await import("../src/hooks/use-chart-theme.js");
		expect(CHART_THEMES.light.grid).toBe("#E2E8F0");
	});

	test("has correct crosshair color", async () => {
		const { CHART_THEMES } = await import("../src/hooks/use-chart-theme.js");
		expect(CHART_THEMES.light.crosshair).toBe("#CBD5E1");
	});

	test("has correct price scale text color", async () => {
		const { CHART_THEMES } = await import("../src/hooks/use-chart-theme.js");
		expect(CHART_THEMES.light.scaleText).toBe("#475569");
	});

	test("has theme-invariant bullish candle color", async () => {
		const { CHART_THEMES } = await import("../src/hooks/use-chart-theme.js");
		expect(CHART_THEMES.light.bullish).toBe("#22C55E");
	});

	test("has theme-invariant bearish candle color", async () => {
		const { CHART_THEMES } = await import("../src/hooks/use-chart-theme.js");
		expect(CHART_THEMES.light.bearish).toBe("#EF4444");
	});

	test("has series colors (theme-invariant)", async () => {
		const { CHART_THEMES } = await import("../src/hooks/use-chart-theme.js");
		expect(CHART_THEMES.light.sma).toBe("#3B82F6");
		expect(CHART_THEMES.light.ema).toBe("#8B5CF6");
		expect(CHART_THEMES.light.bbLine).toBe("#64748B");
		expect(CHART_THEMES.light.bbFill).toBe("rgba(100,116,139,0.06)");
	});
});

describe("toLightweightChartsOptions", () => {
	test("exported from module", async () => {
		const mod = await import("../src/hooks/use-chart-theme.js");
		expect(typeof mod.toLightweightChartsOptions).toBe("function");
	});

	test("dark theme produces correct layout options", async () => {
		const { CHART_THEMES, toLightweightChartsOptions } = await import(
			"../src/hooks/use-chart-theme.js"
		);
		const opts = toLightweightChartsOptions(CHART_THEMES.dark);
		expect(opts.layout?.background).toEqual({ color: "#0A0A0F" });
		expect(opts.layout?.textColor).toBe("#94A3B8");
		expect(opts.grid?.vertLines?.color).toBe("#1E293B");
		expect(opts.grid?.horzLines?.color).toBe("#1E293B");
		expect(opts.crosshair?.vertLine?.color).toBe("#334155");
		expect(opts.crosshair?.horzLine?.color).toBe("#334155");
	});

	test("light theme produces correct layout options", async () => {
		const { CHART_THEMES, toLightweightChartsOptions } = await import(
			"../src/hooks/use-chart-theme.js"
		);
		const opts = toLightweightChartsOptions(CHART_THEMES.light);
		expect(opts.layout?.background).toEqual({ color: "#FFFFFF" });
		expect(opts.layout?.textColor).toBe("#475569");
		expect(opts.grid?.vertLines?.color).toBe("#E2E8F0");
		expect(opts.grid?.horzLines?.color).toBe("#E2E8F0");
		expect(opts.crosshair?.vertLine?.color).toBe("#CBD5E1");
		expect(opts.crosshair?.horzLine?.color).toBe("#CBD5E1");
	});
});

describe("barrel export", () => {
	test("index.ts exports useChartTheme", async () => {
		const mod = await import("../src/index.js");
		expect(typeof mod.useChartTheme).toBe("function");
	});

	test("index.ts exports CHART_THEMES", async () => {
		const mod = await import("../src/index.js");
		expect(mod.CHART_THEMES).toBeDefined();
	});

	test("index.ts exports toLightweightChartsOptions", async () => {
		const mod = await import("../src/index.js");
		expect(typeof mod.toLightweightChartsOptions).toBe("function");
	});
});
