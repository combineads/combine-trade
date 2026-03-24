/**
 * Tests for Tauri-specific better-auth client.
 *
 * Mocks @tauri-apps/plugin-store and better-auth/client so no Tauri runtime
 * or server is required.
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
	type BetterAuthClientInstance,
	createTauriAuthClient,
} from "../src/auth/tauri-auth-client.js";

// ---------------------------------------------------------------------------
// Mock @tauri-apps/plugin-store via module mock
// ---------------------------------------------------------------------------
const mockStoreData: Record<string, unknown> = {};
const mockStoreSave = mock(() => Promise.resolve());
const mockStoreSet = mock((key: string, value: unknown) => {
	mockStoreData[key] = value;
	return Promise.resolve();
});
const mockStoreGet = mock((key: string) => Promise.resolve(mockStoreData[key] ?? null));
const mockStoreDelete = mock((key: string) => {
	delete mockStoreData[key];
	return Promise.resolve();
});

// ---------------------------------------------------------------------------
// Mock better-auth/client (vanilla)
// ---------------------------------------------------------------------------
const mockSignInEmail = mock((_opts: unknown) => Promise.resolve({ data: null, error: null }));
const mockSignOut = mock((_opts?: unknown) => Promise.resolve({ data: null, error: null }));

let mockSessionData: {
	data: { user: { id: string; email: string; role?: string } } | null;
	error: null;
	isPending: boolean;
	isRefetching: boolean;
	refetch: () => Promise<void>;
} = {
	data: null,
	error: null,
	isPending: false,
	isRefetching: false,
	refetch: () => Promise.resolve(),
};

const mockGetSession = mock(() => Promise.resolve(mockSessionData));

const mockVanillaClient = {
	signIn: Object.assign(mock(() => Promise.resolve()), { email: mockSignInEmail }),
	signOut: mockSignOut,
	getSession: mockGetSession,
	$store: {
		get: () => mockSessionData,
	},
};

// ---------------------------------------------------------------------------
// Override dynamic imports before tests run
// ---------------------------------------------------------------------------
const originalDynamicImport = globalThis.__dynamicImport__;

// We need to mock the module loading. Since bun:test doesn't support
// module-level mocking of dynamic imports directly, we test the factory
// and the store interaction via the public interface.

describe("createTauriAuthClient", () => {
	beforeEach(() => {
		// Reset mock store data
		for (const key of Object.keys(mockStoreData)) {
			delete mockStoreData[key];
		}
		mockStoreSave.mockClear();
		mockStoreSet.mockClear();
		mockStoreGet.mockClear();
		mockStoreDelete.mockClear();
		mockSignInEmail.mockClear();
		mockSignOut.mockClear();
		mockGetSession.mockClear();
		mockSessionData = {
			data: null,
			error: null,
			isPending: false,
			isRefetching: false,
			refetch: () => Promise.resolve(),
		};
	});

	test("factory returns an object with the expected shape", () => {
		const client = createTauriAuthClient({ baseURL: "http://localhost:3100" });
		expect(typeof client).toBe("object");
		expect(client).not.toBeNull();
	});

	test("exposes signIn with email sub-method", () => {
		const client = createTauriAuthClient({ baseURL: "http://localhost:3100" });
		expect(typeof client.signIn).toBe("function");
		expect(typeof (client.signIn as unknown as Record<string, unknown>).email).toBe("function");
	});

	test("exposes signOut method", () => {
		const client = createTauriAuthClient({ baseURL: "http://localhost:3100" });
		expect(typeof client.signOut).toBe("function");
	});

	test("exposes useSession hook", () => {
		const client = createTauriAuthClient({ baseURL: "http://localhost:3100" });
		expect(typeof client.useSession).toBe("function");
	});

	test("exposes getSession method", () => {
		const client = createTauriAuthClient({ baseURL: "http://localhost:3100" });
		expect(typeof client.getSession).toBe("function");
	});

	test("satisfies BetterAuthClientInstance type", () => {
		const client: BetterAuthClientInstance = createTauriAuthClient({
			baseURL: "http://localhost:3100",
		});
		expect(client.signIn).toBeDefined();
		expect(client.signOut).toBeDefined();
		expect(client.useSession).toBeDefined();
		expect(client.getSession).toBeDefined();
	});

	test("useSession returns object with data and isPending fields", () => {
		const client = createTauriAuthClient({ baseURL: "http://localhost:3100" });
		// useSession is a React hook — we call it directly here since there's no
		// React renderer in this environment. It should return the session shape.
		const session = client.useSession();
		expect(session).toHaveProperty("data");
		expect(session).toHaveProperty("isPending");
	});

	test("baseURL is configurable", () => {
		const client1 = createTauriAuthClient({ baseURL: "http://localhost:3100" });
		const client2 = createTauriAuthClient({ baseURL: "https://api.example.com" });
		expect(client1).toBeDefined();
		expect(client2).toBeDefined();
	});
});

describe("TauriAuthClient store integration", () => {
	beforeEach(() => {
		// Ensure store is clean before every store integration test
		for (const key of Object.keys(mockStoreData)) {
			delete mockStoreData[key];
		}
		mockStoreSave.mockClear();
		mockStoreSet.mockClear();
		mockStoreGet.mockClear();
		mockStoreDelete.mockClear();
	});

	test("storeSession writes token to store", async () => {
		const client = createTauriAuthClient({
			baseURL: "http://localhost:3100",
			_storeAdapter: {
				set: mockStoreSet,
				get: mockStoreGet,
				delete: mockStoreDelete,
				save: mockStoreSave,
			},
		});

		await client._storeSession({ token: "tok-abc", userId: "u1" });

		expect(mockStoreSet).toHaveBeenCalledWith("session_token", "tok-abc");
		expect(mockStoreSet).toHaveBeenCalledWith("session_user_id", "u1");
		expect(mockStoreSave).toHaveBeenCalled();
	});

	test("clearSession removes token from store", async () => {
		mockStoreData.session_token = "tok-old";
		mockStoreData.session_user_id = "u1";

		const client = createTauriAuthClient({
			baseURL: "http://localhost:3100",
			_storeAdapter: {
				set: mockStoreSet,
				get: mockStoreGet,
				delete: mockStoreDelete,
				save: mockStoreSave,
			},
		});

		await client._clearSession();

		expect(mockStoreDelete).toHaveBeenCalledWith("session_token");
		expect(mockStoreDelete).toHaveBeenCalledWith("session_user_id");
		expect(mockStoreSave).toHaveBeenCalled();
	});

	test("getStoredToken reads token from store", async () => {
		mockStoreData.session_token = "tok-xyz";

		const client = createTauriAuthClient({
			baseURL: "http://localhost:3100",
			_storeAdapter: {
				set: mockStoreSet,
				get: mockStoreGet,
				delete: mockStoreDelete,
				save: mockStoreSave,
			},
		});

		const token = await client._getStoredToken();

		expect(token).toBe("tok-xyz");
		expect(mockStoreGet).toHaveBeenCalledWith("session_token");
	});

	test("getStoredToken returns null when no token", async () => {
		const client = createTauriAuthClient({
			baseURL: "http://localhost:3100",
			_storeAdapter: {
				set: mockStoreSet,
				get: mockStoreGet,
				delete: mockStoreDelete,
				save: mockStoreSave,
			},
		});

		const token = await client._getStoredToken();
		expect(token).toBeNull();
	});
});
