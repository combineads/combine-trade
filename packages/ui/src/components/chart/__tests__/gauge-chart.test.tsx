import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { GaugeChart, gaugeSectors, valueToAngle } from "../GaugeChart";

describe("valueToAngle", () => {
	test("maps 0ms to 0 degrees", () => {
		expect(valueToAngle(0)).toBe(0);
	});

	test("maps 1500ms to 180 degrees", () => {
		expect(valueToAngle(1500)).toBe(180);
	});

	test("maps 750ms to 90 degrees (midpoint)", () => {
		expect(valueToAngle(750)).toBeCloseTo(90, 1);
	});

	test("clamps values above 1500ms to 180 degrees", () => {
		expect(valueToAngle(2000)).toBe(180);
		expect(valueToAngle(9999)).toBe(180);
	});

	test("clamps negative values to 0 degrees", () => {
		expect(valueToAngle(-100)).toBe(0);
	});
});

describe("gaugeSectors", () => {
	test("returns 3 sectors", () => {
		const sectors = gaugeSectors();
		expect(sectors.length).toBe(3);
	});

	test("green sector spans 0-500ms range", () => {
		const sectors = gaugeSectors();
		const green = sectors.find((s) => s.color === "#22C55E");
		expect(green).toBeDefined();
		expect(green?.startAngle).toBe(0);
		expect(green?.endAngle).toBeCloseTo(60, 1); // 500/1500 * 180
	});

	test("yellow sector spans 500-800ms range", () => {
		const sectors = gaugeSectors();
		const yellow = sectors.find((s) => s.color === "#EAB308");
		expect(yellow).toBeDefined();
		expect(yellow?.startAngle).toBeCloseTo(60, 1);
		expect(yellow?.endAngle).toBeCloseTo(96, 1); // 800/1500 * 180
	});

	test("red sector spans 800ms+ range", () => {
		const sectors = gaugeSectors();
		const red = sectors.find((s) => s.color === "#EF4444");
		expect(red).toBeDefined();
		expect(red?.startAngle).toBeCloseTo(96, 1);
		expect(red?.endAngle).toBe(180);
	});
});

describe("GaugeChart", () => {
	test("renders SVG element", () => {
		const html = renderToString(<GaugeChart value={300} percentile="p50" />);
		expect(html).toContain("<svg");
	});

	test("renders with data-testid", () => {
		const html = renderToString(<GaugeChart value={300} percentile="p50" />);
		expect(html).toContain('data-testid="gauge-chart"');
	});

	test("renders percentile label", () => {
		const html = renderToString(<GaugeChart value={300} percentile="p50" />);
		expect(html).toContain("p50");
	});

	test("renders numeric value", () => {
		const html = renderToString(<GaugeChart value={300} percentile="p50" />);
		expect(html).toContain("300");
	});

	test("value=300 needle angle is in green zone", () => {
		const html = renderToString(<GaugeChart value={300} percentile="p50" />);
		// angle = 300/1500 * 180 = 36 degrees — well within green (0-60)
		expect(html).toContain('data-zone="green"');
	});

	test("value=650 needle angle is in yellow zone", () => {
		const html = renderToString(<GaugeChart value={650} percentile="p95" />);
		// angle = 650/1500 * 180 = 78 degrees — within yellow (60-96)
		expect(html).toContain('data-zone="yellow"');
	});

	test("value=900 needle angle is in red zone", () => {
		const html = renderToString(<GaugeChart value={900} percentile="p99" />);
		// angle = 900/1500 * 180 = 108 degrees — within red (96-180)
		expect(html).toContain('data-zone="red"');
	});

	test("value=2000 clamps to max position (red zone)", () => {
		const html = renderToString(<GaugeChart value={2000} percentile="p99" />);
		expect(html).toContain('data-zone="red"');
	});

	test("renders three colored arc segments", () => {
		const html = renderToString(<GaugeChart value={300} percentile="p50" />);
		expect(html).toContain("#22C55E"); // green
		expect(html).toContain("#EAB308"); // yellow
		expect(html).toContain("#EF4444"); // red
	});

	test("renders 'ms' unit label", () => {
		const html = renderToString(<GaugeChart value={300} percentile="p50" />);
		expect(html).toContain("ms");
	});

	test("accepts optional className prop", () => {
		const html = renderToString(<GaugeChart value={300} percentile="p50" className="my-gauge" />);
		expect(html).toContain("my-gauge");
	});
});

describe("GaugeChart SSE integration", () => {
	const originalEventSource = globalThis.EventSource;

	beforeEach(() => {
		// Mock EventSource for SSE tests
		const mockClose = mock(() => {});
		const mockEs: Partial<EventSource> = {
			close: mockClose,
			addEventListener: mock(() => {}),
			removeEventListener: mock(() => {}),
			onopen: null,
			onerror: null,
			onmessage: null,
			readyState: 0,
		};
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		(globalThis as any).EventSource = mock(() => mockEs);
	});

	afterEach(() => {
		globalThis.EventSource = originalEventSource;
	});

	test("does not throw when sseUrl is provided in SSR (no EventSource)", () => {
		// In SSR test environment, EventSource may not exist — just ensure no throw
		expect(() =>
			renderToString(<GaugeChart value={300} percentile="p50" sseUrl="/api/metrics/latency" />),
		).not.toThrow();
	});

	test("renders without sseUrl (static mode)", () => {
		const html = renderToString(<GaugeChart value={500} percentile="p95" />);
		expect(html).toContain("500");
	});
});
