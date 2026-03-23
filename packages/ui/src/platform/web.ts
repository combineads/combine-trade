import type { PlatformAdapter } from "./context.js";

async function sendNotification(title: string, body: string): Promise<void> {
	if (typeof Notification === "undefined") return;

	if (Notification.permission === "default") {
		await Notification.requestPermission();
	}

	if (Notification.permission === "granted") {
		new Notification(title, { body });
	}
}

async function storeRefreshToken(_token: string): Promise<void> {
	// Web: refresh token is stored in httpOnly cookie by the server.
	// No client-side storage needed.
}

async function getRefreshToken(): Promise<string | undefined> {
	// Web: refresh token lives in httpOnly cookie, not accessible from JS.
	return undefined;
}

export const webAdapter: PlatformAdapter = {
	isDesktop: false,
	sendNotification,
	storeRefreshToken,
	getRefreshToken,
};
