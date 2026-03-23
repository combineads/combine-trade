import { createAuth } from "@combine/shared/auth/better-auth.js";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../../../db/index.js";
import {
	authAccount,
	authSession,
	authUser,
	authVerification,
} from "../../../db/schema/better-auth.js";
import { DrizzleStrategyRepository } from "../../../packages/core/strategy/drizzle-repository.js";
import { ExecutionModeDbService } from "../../../packages/execution/mode-db.js";
import { createAlertDeps } from "./db/alerts-queries.js";
import { createBacktestDeps } from "./db/backtest-queries.js";
import { createCandleDeps } from "./db/candles-queries.js";
import { createCredentialDeps } from "./db/credentials-queries.js";
import { createEventDeps } from "./db/events-queries.js";
import { createExecutionModeDbDeps } from "./db/execution-glue.js";
import { createJournalDeps } from "./db/journals-queries.js";
import { createKillSwitchDeps } from "./db/kill-switch-glue.js";
import { createOrderDeps } from "./db/orders-queries.js";
import { createPaperDeps } from "./db/paper-queries.js";
import { createSseBridge } from "./db/sse-bridge.js";
import { createStrategyDbDeps } from "./db/strategy-glue.js";
import { type ApiServerDeps, createApiServer } from "./server.js";

const PORT = Number(process.env.PORT) || 3000;

const auth = createAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: {
			user: authUser,
			session: authSession,
			account: authAccount,
			verification: authVerification,
		},
	}),
	trustedOrigins: [process.env.ALLOWED_ORIGIN ?? "http://localhost:3001"],
});

const masterEncryptionKey = process.env.MASTER_ENCRYPTION_KEY ?? "0".repeat(64);

const strategyRepository = new DrizzleStrategyRepository(createStrategyDbDeps(db));
const executionModeDeps = new ExecutionModeDbService(createExecutionModeDbDeps(db));
const killSwitchDeps = createKillSwitchDeps(db);
const { sseSubscribe } = createSseBridge();

const deps: ApiServerDeps = {
	auth,
	masterEncryptionKey,
	strategyRepository,
	executionModeDeps,
	killSwitchDeps,
	sseSubscribe,
	credentialDeps: createCredentialDeps(db, masterEncryptionKey),
	eventDeps: createEventDeps(db),
	orderDeps: createOrderDeps(db),
	candleDeps: createCandleDeps(db),
	alertDeps: createAlertDeps(db),
	backtestDeps: createBacktestDeps(db),
	journalDeps: createJournalDeps(db),
	paperDeps: createPaperDeps(db),
};

export const app = createApiServer(deps);

app.listen(PORT);

console.info(`API server running on http://localhost:${PORT}`);
