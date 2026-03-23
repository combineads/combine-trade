import { type ApiServerDeps, type AuthLike, createApiServer } from "./server.js";

const PORT = Number(process.env.PORT) || 3000;

/**
 * Stub auth instance for development before the DB is wired.
 * Replace with a real createAuth(drizzleAdapter(db)) call once DB wiring is complete.
 */
const stubAuth: AuthLike = {
	handler: async (_req: Request): Promise<Response> => {
		return new Response(JSON.stringify({ error: "Auth not wired to DB yet" }), {
			status: 503,
			headers: { "content-type": "application/json" },
		});
	},
	api: {
		getSession: async (_ctx: { headers: Headers }) => {
			// In development without DB, reject all sessions
			return null;
		},
	},
};

/**
 * Server entry point.
 *
 * In production, deps are wired to real Drizzle repositories and services.
 * For now, the server starts with stub deps that log warnings.
 * Replace these with real implementations as DB wiring tasks complete.
 */
const stubDeps: ApiServerDeps = {
	auth: stubAuth,
	masterEncryptionKey: process.env.MASTER_ENCRYPTION_KEY ?? "0".repeat(64),
	strategyRepository: {
		findAll: async () => [],
		findById: async () => null,
		findByNameAndVersion: async () => null,
		findActive: async () => [],
		create: async () => {
			throw new Error("Not wired to DB");
		},
		update: async () => {
			throw new Error("Not wired to DB");
		},
		softDelete: async () => {
			throw new Error("Not wired to DB");
		},
		createNewVersion: async () => {
			throw new Error("Not wired to DB");
		},
	},
	executionModeDeps: {
		loadMode: async () => "analysis",
		saveMode: async () => {},
		getSafetyGateStatus: async () => ({
			killSwitchEnabled: false,
			dailyLossLimitConfigured: false,
		}),
	},
	killSwitchDeps: {
		activate: async () => {
			throw new Error("Not wired to DB");
		},
		deactivate: async () => {
			throw new Error("Not wired to DB");
		},
		getActiveStates: async () => [],
		getAuditEvents: async () => ({ items: [], total: 0 }),
	},
	sseSubscribe: () => () => {},
	credentialDeps: {
		masterKey: process.env.MASTER_ENCRYPTION_KEY ?? "0".repeat(64),
		findByUserId: async () => [],
		findById: async () => null,
		create: async () => {
			throw new Error("Not wired to DB");
		},
		update: async () => {
			throw new Error("Not wired to DB");
		},
		remove: async () => {
			throw new Error("Not wired to DB");
		},
	},
	eventDeps: {
		findEventById: async () => null,
		findEventsByStrategy: async () => ({ items: [], total: 0 }),
		getStrategyStatistics: async () => ({
			winRate: 0,
			expectancy: 0,
			avgPnl: 0,
			sampleCount: 0,
			totalEvents: 0,
			longCount: 0,
			shortCount: 0,
		}),
		strategyExists: async () => false,
	},
	orderDeps: {
		findOrders: async () => ({ items: [], total: 0 }),
	},
	candleDeps: {
		findCandles: async () => ({ items: [], total: 0 }),
	},
	alertDeps: {
		findAlerts: async () => ({ items: [], total: 0 }),
	},
	backtestDeps: {
		runBacktest: async () => {
			throw new Error("Not wired to backtest engine");
		},
		strategyExists: async () => false,
	},
	journalDeps: {
		listJournals: async () => ({ data: [], total: 0 }),
		getJournal: async () => null,
		searchJournals: async () => ({ data: [], total: 0 }),
		getJournalAnalytics: async () => ({ tagStats: [], overallWinrate: 0, overallExpectancy: 0 }),
	},
	paperDeps: {
		getPaperStatus: async () => ({
			balance: "0",
			positions: [],
			unrealizedPnl: "0",
			totalPnl: "0",
		}),
		listPaperOrders: async () => ({ data: [], total: 0 }),
		getPaperPerformance: async () => ({ summaries: [] }),
		getPaperComparison: async () => ({ backtest: {}, paper: {}, delta: {} }),
		resetPaper: async (b) => ({ success: true as const, balance: b }),
	},
};

export const app = createApiServer(stubDeps);

app.listen(PORT);

console.info(`API server running on http://localhost:${PORT}`);
