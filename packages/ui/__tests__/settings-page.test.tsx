import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { SettingsView } from "../src/views/settings/settings-view";

describe("SettingsView", () => {
	test("renders settings heading", () => {
		const html = renderToString(<SettingsView />);
		expect(html).toContain("Settings");
	});

	test("renders appearance section with theme buttons", () => {
		const html = renderToString(<SettingsView theme="dark" />);
		expect(html).toContain("Appearance");
		expect(html).toContain("Dark");
		expect(html).toContain("Light");
	});

	test("renders general section placeholder", () => {
		const html = renderToString(<SettingsView />);
		expect(html).toContain("General");
		expect(html).toContain("General settings coming soon");
	});

	test("renders exchange section placeholder", () => {
		const html = renderToString(<SettingsView />);
		expect(html).toContain("Exchange");
		expect(html).toContain("Exchange configuration managed in Credentials");
	});

	test("highlights active theme", () => {
		const darkHtml = renderToString(<SettingsView theme="dark" />);
		expect(darkHtml).toContain("Dark");
		const lightHtml = renderToString(<SettingsView theme="light" />);
		expect(lightHtml).toContain("Light");
	});
});
