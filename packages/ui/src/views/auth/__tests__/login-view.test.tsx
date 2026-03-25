import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { ThemeProvider } from "../../../theme/theme-provider";
import { LoginView } from "../login-view";

function renderWithTheme(ui: React.ReactElement) {
	return renderToString(<ThemeProvider defaultTheme="dark">{ui}</ThemeProvider>);
}

describe("LoginView", () => {
	const noop = async () => {};

	test("renders Lockup component above the form", () => {
		const html = renderWithTheme(<LoginView onSubmit={noop} />);
		// Lockup renders Logo SVG + "Combine" + "Trade" text
		expect(html).toContain("<svg");
		expect(html).toContain("#22C55E");
		expect(html).toContain("#EF4444");
		// Lockup lg renders icon at 48px
		expect(html).toContain('width="48"');
		expect(html).toContain('height="48"');
	});

	test("Lockup contains Combine and Trade text", () => {
		const html = renderWithTheme(<LoginView onSubmit={noop} />);
		expect(html).toContain("Combine");
		expect(html).toContain("Trade");
	});

	test("Lockup is centered", () => {
		const html = renderWithTheme(<LoginView onSubmit={noop} />);
		expect(html).toContain("justify-content:center");
	});

	test("renders login form fields", () => {
		const html = renderWithTheme(<LoginView onSubmit={noop} />);
		expect(html).toContain('id="username"');
		expect(html).toContain('id="password"');
		expect(html).toContain('type="submit"');
	});

	test("renders error message when provided", () => {
		const html = renderWithTheme(<LoginView onSubmit={noop} error="Invalid credentials" />);
		expect(html).toContain("Invalid credentials");
	});
});
