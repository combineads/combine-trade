import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import type { EconomicCalendarWidgetProps } from "../src/views/charts/economic-calendar-widget";
import { EconomicCalendarWidget } from "../src/views/charts/economic-calendar-widget";
import type { TimelineWidgetProps } from "../src/views/charts/timeline-widget";
import { TimelineWidget } from "../src/views/charts/timeline-widget";

describe("TimelineWidget", () => {
	test("renders container div with data-testid", () => {
		const html = renderToString(<TimelineWidget />);
		expect(html).toContain('data-testid="timeline-widget"');
	});

	test("accepts dark theme without throwing", () => {
		expect(() => renderToString(<TimelineWidget theme="dark" />)).not.toThrow();
	});

	test("accepts light theme without throwing", () => {
		expect(() => renderToString(<TimelineWidget theme="light" />)).not.toThrow();
	});

	test("applies custom height", () => {
		const html = renderToString(<TimelineWidget height={500} />);
		expect(html).toContain("500px");
	});

	test("applies custom className", () => {
		const html = renderToString(<TimelineWidget className="my-timeline" />);
		expect(html).toContain("my-timeline");
	});

	test("defaults to 550px height", () => {
		const html = renderToString(<TimelineWidget />);
		expect(html).toContain("550px");
	});

	test("exports TimelineWidgetProps type", () => {
		const props: TimelineWidgetProps = {};
		expect(props).toBeDefined();
	});
});

describe("EconomicCalendarWidget", () => {
	test("renders container div with data-testid", () => {
		const html = renderToString(<EconomicCalendarWidget />);
		expect(html).toContain('data-testid="economic-calendar-widget"');
	});

	test("accepts dark theme without throwing", () => {
		expect(() => renderToString(<EconomicCalendarWidget theme="dark" />)).not.toThrow();
	});

	test("accepts light theme without throwing", () => {
		expect(() => renderToString(<EconomicCalendarWidget theme="light" />)).not.toThrow();
	});

	test("applies custom height", () => {
		const html = renderToString(<EconomicCalendarWidget height={700} />);
		expect(html).toContain("700px");
	});

	test("applies custom className", () => {
		const html = renderToString(<EconomicCalendarWidget className="my-calendar" />);
		expect(html).toContain("my-calendar");
	});

	test("defaults to 600px height", () => {
		const html = renderToString(<EconomicCalendarWidget />);
		expect(html).toContain("600px");
	});

	test("exports EconomicCalendarWidgetProps type", () => {
		const props: EconomicCalendarWidgetProps = {};
		expect(props).toBeDefined();
	});
});
