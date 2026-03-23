import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { KillSwitchBanner, NotificationBanner } from "../src/components/notification-banner";

describe("NotificationBanner", () => {
	test("renders nothing when active is false", () => {
		const html = renderToString(<NotificationBanner active={false} message="test" />);
		expect(html).toBe("");
	});

	test("renders banner when active is true", () => {
		const html = renderToString(<NotificationBanner active message="System alert" />);
		expect(html).toContain("System alert");
	});

	test("renders critical variant by default", () => {
		const html = renderToString(<NotificationBanner active message="Critical!" />);
		expect(html).toContain("Critical!");
	});

	test("renders warning variant", () => {
		const html = renderToString(<NotificationBanner active variant="warning" message="Warning!" />);
		expect(html).toContain("Warning!");
	});

	test("renders action button when provided", () => {
		const html = renderToString(
			<NotificationBanner
				active
				message="Info"
				variant="info"
				actionLabel="Dismiss"
				onAction={() => {}}
			/>,
		);
		expect(html).toContain("Dismiss");
	});
});

describe("KillSwitchBanner", () => {
	test("renders kill switch message when active", () => {
		const html = renderToString(<KillSwitchBanner active />);
		expect(html).toContain("Kill Switch Active");
		expect(html).toContain("All trading is halted");
	});

	test("renders nothing when inactive", () => {
		const html = renderToString(<KillSwitchBanner active={false} />);
		expect(html).toBe("");
	});
});
