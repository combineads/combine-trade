import { describe, expect, mock, test } from "bun:test";
import { webAdapter } from "../web.js";
import { tauriAdapter } from "../tauri.js";

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

describe("tauriAdapter", () => {
	test("isDesktop is true", () => {
		expect(tauriAdapter.isDesktop).toBe(true);
	});

	test("sendNotification calls @tauri-apps/plugin-notification sendNotification", async () => {
		const mockSendNotification = mock(async (_opts: { title: string; body: string }) => {});

		mock.module("@tauri-apps/plugin-notification", () => ({
			sendNotification: mockSendNotification,
		}));

		await tauriAdapter.sendNotification("Alert", "Price reached target");

		expect(mockSendNotification).toHaveBeenCalledTimes(1);
		expect(mockSendNotification).toHaveBeenCalledWith({
			title: "Alert",
			body: "Price reached target",
		});
	});

	test("storeRefreshToken stores token via @tauri-apps/plugin-store Store", async () => {
		const mockSet = mock(async (_key: string, _value: unknown) => {});
		const mockSave = mock(async () => {});
		const mockLoad = mock(async (_path: string) => ({
			set: mockSet,
			save: mockSave,
			get: mock(async (_key: string) => null),
		}));

		mock.module("@tauri-apps/plugin-store", () => ({
			Store: { load: mockLoad },
		}));

		await tauriAdapter.storeRefreshToken("my-refresh-token");

		expect(mockLoad).toHaveBeenCalledWith("auth.json");
		expect(mockSet).toHaveBeenCalledWith("refreshToken", "my-refresh-token");
		expect(mockSave).toHaveBeenCalledTimes(1);
	});

	test("getRefreshToken retrieves token via @tauri-apps/plugin-store Store", async () => {
		const mockGet = mock(async (_key: string) => "stored-token");
		const mockLoad = mock(async (_path: string) => ({
			set: mock(async () => {}),
			save: mock(async () => {}),
			get: mockGet,
		}));

		mock.module("@tauri-apps/plugin-store", () => ({
			Store: { load: mockLoad },
		}));

		const result = await tauriAdapter.getRefreshToken();

		expect(mockLoad).toHaveBeenCalledWith("auth.json");
		expect(mockGet).toHaveBeenCalledWith("refreshToken");
		expect(result).toBe("stored-token");
	});

	test("getRefreshToken returns undefined when store has no token", async () => {
		const mockGet = mock(async (_key: string) => null);
		const mockLoad = mock(async (_path: string) => ({
			set: mock(async () => {}),
			save: mock(async () => {}),
			get: mockGet,
		}));

		mock.module("@tauri-apps/plugin-store", () => ({
			Store: { load: mockLoad },
		}));

		const result = await tauriAdapter.getRefreshToken();

		expect(result).toBeUndefined();
	});

	test("storeRefreshToken + getRefreshToken round-trip (shared store mock)", async () => {
		const storage: Record<string, unknown> = {};

		const makeStore = () => ({
			set: mock(async (key: string, value: unknown) => {
				storage[key] = value;
			}),
			save: mock(async () => {}),
			get: mock(async (key: string) => storage[key] ?? null),
		});

		mock.module("@tauri-apps/plugin-store", () => ({
			Store: { load: mock(async (_path: string) => makeStore()) },
		}));

		await tauriAdapter.storeRefreshToken("round-trip-token");
		const retrieved = await tauriAdapter.getRefreshToken();

		expect(retrieved).toBe("round-trip-token");
	});
});
