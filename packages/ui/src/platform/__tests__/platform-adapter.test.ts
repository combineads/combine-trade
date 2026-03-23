import { describe, expect, mock, test } from "bun:test";
import { webAdapter } from "../web.js";

describe("webAdapter", () => {
	test("isDesktop is false", () => {
		expect(webAdapter.isDesktop).toBe(false);
	});

	test("storeRefreshToken is a no-op (resolves without error)", async () => {
		await expect(webAdapter.storeRefreshToken("token-abc")).resolves.toBeUndefined();
	});

	test("getRefreshToken returns undefined", async () => {
		const result = await webAdapter.getRefreshToken();
		expect(result).toBeUndefined();
	});

	test("sendNotification calls Notification API when permission is granted", async () => {
		const notificationInstances: { title: string; opts: NotificationOptions }[] = [];

		// Mock the global Notification constructor
		const MockNotification = function (
			this: Notification,
			title: string,
			opts: NotificationOptions,
		) {
			notificationInstances.push({ title, opts });
		} as unknown as typeof Notification;
		MockNotification.permission = "granted" as NotificationPermission;
		MockNotification.requestPermission = mock(async () => "granted" as NotificationPermission);

		const original = globalThis.Notification;
		globalThis.Notification = MockNotification;

		try {
			await webAdapter.sendNotification("Test Title", "Test Body");
			expect(notificationInstances).toHaveLength(1);
			expect(notificationInstances[0].title).toBe("Test Title");
			expect(notificationInstances[0].opts).toEqual({ body: "Test Body" });
		} finally {
			globalThis.Notification = original;
		}
	});

	test("sendNotification requests permission when not yet granted", async () => {
		const notificationInstances: { title: string; opts: NotificationOptions }[] = [];
		let requestPermissionCalled = false;

		const MockNotification = function (
			this: Notification,
			title: string,
			opts: NotificationOptions,
		) {
			notificationInstances.push({ title, opts });
		} as unknown as typeof Notification;
		MockNotification.permission = "default" as NotificationPermission;
		MockNotification.requestPermission = mock(async () => {
			requestPermissionCalled = true;
			MockNotification.permission = "granted" as NotificationPermission;
			return "granted" as NotificationPermission;
		});

		const original = globalThis.Notification;
		globalThis.Notification = MockNotification;

		try {
			await webAdapter.sendNotification("Hello", "World");
			expect(requestPermissionCalled).toBe(true);
			expect(notificationInstances).toHaveLength(1);
		} finally {
			globalThis.Notification = original;
		}
	});

	test("sendNotification is a no-op when Notification API is unavailable", async () => {
		const original = globalThis.Notification;
		// biome-ignore lint/suspicious/noExplicitAny: intentional deletion for test
		(globalThis as any).Notification = undefined;

		try {
			// Should not throw
			await expect(webAdapter.sendNotification("Title", "Body")).resolves.toBeUndefined();
		} finally {
			globalThis.Notification = original;
		}
	});

	test("sendNotification is a no-op when permission is denied", async () => {
		const notificationInstances: unknown[] = [];

		const MockNotification = function (this: Notification) {
			notificationInstances.push(this);
		} as unknown as typeof Notification;
		MockNotification.permission = "denied" as NotificationPermission;
		MockNotification.requestPermission = mock(async () => "denied" as NotificationPermission);

		const original = globalThis.Notification;
		globalThis.Notification = MockNotification;

		try {
			await webAdapter.sendNotification("Title", "Body");
			expect(notificationInstances).toHaveLength(0);
		} finally {
			globalThis.Notification = original;
		}
	});
});
