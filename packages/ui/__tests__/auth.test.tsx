import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { createAuthStore } from "../src/stores/auth-store";
import { LoginView } from "../src/views/auth/login-view";

describe("LoginView", () => {
	test("renders login form (Korean default)", () => {
		const html = renderToString(<LoginView onSubmit={() => Promise.resolve()} />);
		expect(html).toContain("Combine Trade");
		// Input name/id attributes stay in English
		expect(html).toContain("username");
		expect(html).toContain("password");
		// Korean labels by default
		expect(html).toContain("사용자 이름");
		expect(html).toContain("비밀번호");
		expect(html).toContain("로그인");
	});

	test("renders error message when provided", () => {
		const html = renderToString(
			<LoginView onSubmit={() => Promise.resolve()} error="Invalid credentials" />,
		);
		expect(html).toContain("Invalid credentials");
	});

	test("renders loading state (Korean)", () => {
		const html = renderToString(<LoginView onSubmit={() => Promise.resolve()} loading={true} />);
		expect(html).toContain("로그인 중");
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
