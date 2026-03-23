import { describe, expect, test } from "bun:test";
import { type AuthState, type AuthUser, initialAuthState } from "../src/auth/auth-context.js";

describe("AuthContext", () => {
	test("initialAuthState has correct shape", () => {
		expect(initialAuthState.user).toBeNull();
		expect(initialAuthState.accessToken).toBeNull();
		expect(initialAuthState.isAuthenticated).toBe(false);
		expect(initialAuthState.isLoading).toBe(true);
	});

	test("AuthUser type includes id, email, role", () => {
		const user: AuthUser = {
			id: "user-1",
			email: "test@example.com",
			role: "admin",
		};
		expect(user.id).toBe("user-1");
		expect(user.email).toBe("test@example.com");
		expect(user.role).toBe("admin");
	});

	test("AuthState authenticated shape", () => {
		const state: AuthState = {
			user: { id: "u1", email: "a@b.com", role: "admin" },
			accessToken: "token-123",
			isAuthenticated: true,
			isLoading: false,
		};
		expect(state.isAuthenticated).toBe(true);
		expect(state.accessToken).toBe("token-123");
	});
});
