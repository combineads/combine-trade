import { createApiServer, type ApiServerDeps } from "./server.js";

const PORT = Number(process.env.PORT) || 3000;

/**
 * Server entry point.
 *
 * In production, deps are wired to real Drizzle repositories and services.
 * For now, the server starts with stub deps that log warnings.
 * Replace these with real implementations as DB wiring tasks complete.
 */
const stubDeps: ApiServerDeps = {
	jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-in-production!!",
	masterEncryptionKey: process.env.MASTER_ENCRYPTION_KEY ?? "0".repeat(64),
	strategyRepository: {
		findAll: async () => [],
		findById: async () => null,
		findByNameAndVersion: async () => null,
		findActive: async () => [],
		create: async () => { throw new Error("Not wired to DB"); },
		update: async () => { throw new Error("Not wired to DB"); },
		softDelete: async () => { throw new Error("Not wired to DB"); },
		createNewVersion: async () => { throw new Error("Not wired to DB"); },
	},
	executionModeDeps: {
		loadMode: async () => "analysis",
		saveMode: async () => {},
		getSafetyGateStatus: async () => ({ killSwitchEnabled: false, dailyLossLimitConfigured: false }),
	},
	killSwitchDeps: {
		activate: async () => { throw new Error("Not wired to DB"); },
		deactivate: async () => { throw new Error("Not wired to DB"); },
		getActiveStates: async () => [],
		getAuditEvents: async () => ({ items: [], total: 0 }),
	},
	findUserByUsername: async () => null,
	sseSubscribe: () => () => {},
};

export const app = createApiServer(stubDeps);

app.listen(PORT);

console.info(`API server running on http://localhost:${PORT}`);
