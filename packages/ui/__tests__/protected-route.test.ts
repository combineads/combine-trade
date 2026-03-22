import { describe, expect, test } from "bun:test";
import {
	shouldRedirect,
	shouldRenderChildren,
	shouldRenderNothing,
} from "../src/auth/protected-route.js";

describe("ProtectedRoute logic", () => {
	test("should redirect when not authenticated and not loading", () => {
		expect(shouldRedirect({ isAuthenticated: false, isLoading: false })).toBe(true);
	});

	test("should render nothing when loading", () => {
		expect(shouldRenderNothing({ isAuthenticated: false, isLoading: true })).toBe(true);
	});

	test("should render children when authenticated", () => {
		expect(shouldRenderChildren({ isAuthenticated: true, isLoading: false })).toBe(true);
	});

	test("should not redirect when loading", () => {
		expect(shouldRedirect({ isAuthenticated: false, isLoading: true })).toBe(false);
	});
});
