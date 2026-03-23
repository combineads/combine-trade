import type { PlatformAdapter } from "./context.js";

export const tauriAdapter: PlatformAdapter = {
	isDesktop: true,

	async sendNotification(title: string, body: string): Promise<void> {
		const { sendNotification } = await import("@tauri-apps/plugin-notification");
		await sendNotification({ title, body });
	},

	async storeRefreshToken(token: string): Promise<void> {
		const { Store } = await import("@tauri-apps/plugin-store");
		const store = await Store.load("auth.json");
		await store.set("refreshToken", token);
		await store.save();
	},

	async getRefreshToken(): Promise<string | undefined> {
		const { Store } = await import("@tauri-apps/plugin-store");
		const store = await Store.load("auth.json");
		return (await store.get<string>("refreshToken")) ?? undefined;
	},
};
