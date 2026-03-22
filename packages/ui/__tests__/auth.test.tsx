import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { LoginView } from "../src/views/auth/login-view";
import { createAuthStore, type AuthState } from "../src/stores/auth-store";

describe("LoginView", () => {
	test("renders login form", () => {
		const html = renderToString(
			<LoginView onSubmit={() => Promise.resolve()} />,
		);
		expect(html).toContain("Combine Trade");
		expect(html).toContain("username");
		expect(html).toContain("password");
		expect(html).toContain("Sign In");
	});

	test("renders error message when provided", () => {
		const html = renderToString(
			<LoginView onSubmit={() => Promise.resolve()} error="Invalid credentials" />,
		);
		expect(html).toContain("Invalid credentials");
	});

	test("renders loading state", () => {
		const html = renderToString(
			<LoginView onSubmit={() => Promise.resolve()} loading={true} />,
		);
		expect(html).toContain("Signing in");
	});
});

describe("AuthStore", () => {
	test("initial state is unauthenticated", () => {
		const store = createAuthStore();
		const state = store.getState();
		expect(state.isAuthenticated).toBe(false);
		expect(state.user).toBeNull();
	});

	test("login sets authenticated state", () => {
		const store = createAuthStore();
		store.getState().setUser({ id: "u1", username: "admin" });
		const state = store.getState();
		expect(state.isAuthenticated).toBe(true);
		expect(state.user?.username).toBe("admin");
	});

	test("logout clears state", () => {
		const store = createAuthStore();
		store.getState().setUser({ id: "u1", username: "admin" });
		store.getState().clearUser();
		const state = store.getState();
		expect(state.isAuthenticated).toBe(false);
		expect(state.user).toBeNull();
	});
});
