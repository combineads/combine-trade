import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { TopBar } from "../src/components/top-bar";

describe("TopBar", () => {
	test("renders app title", () => {
		const html = renderToString(<TopBar />);
		expect(html).toContain("Combine Trade");
	});

	test("renders connected status", () => {
		const html = renderToString(<TopBar />);
		expect(html).toContain("Connected");
	});

	test("renders kill switch indicator when active", () => {
		const html = renderToString(<TopBar killSwitchActive />);
		expect(html).toContain("Kill Switch Active");
	});

	test("does not render kill switch indicator when inactive", () => {
		const html = renderToString(<TopBar killSwitchActive={false} />);
		expect(html).not.toContain("Kill Switch Active");
	});

	test("does not render kill switch by default", () => {
		const html = renderToString(<TopBar />);
		expect(html).not.toContain("Kill Switch Active");
	});
});
