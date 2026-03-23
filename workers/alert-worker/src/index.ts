import { sendSlackWebhook } from "@combine/alert";
import { Channels, PgEventSubscriber } from "@combine/shared/event-bus";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { startAlertWorker } from "./entry.js";
import {
	isAlertSent,
	loadAlertContext,
	loadDecisionResult,
	loadExecutionMode,
	saveAlert,
} from "./db.js";

// 1. Validate DATABASE_URL
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("DATABASE_URL not set");
	process.exit(1);
}

// 2. Warn if SLACK_WEBHOOK_URL is missing — analysis mode doesn't need Slack
const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
if (!slackWebhookUrl) {
	console.warn("SLACK_WEBHOOK_URL not set — running in analysis mode (no Slack notifications)");
}

// 3. Create Drizzle db instance
const pool = postgres(databaseUrl);
const db = drizzle(pool);

// 4. Create PgEventSubscriber + connect
const subscriber = new PgEventSubscriber({ connectionString: databaseUrl });
await subscriber.connect((connectionString) => {
	const client = postgres(connectionString, { max: 1 });

	return {
		listenTo(channel: string, handler: (payload: string) => void) {
			void client.listen(channel, (payload) => handler(payload));
			return () => {};
		},
		async close() {
			await client.end();
		},
	};
});

// 5. Start the alert worker, wiring all deps
const subscription = startAlertWorker({
	subscribe(channel, handler) {
		return subscriber.subscribe(Channels.decisionCompleted, handler as (payload: unknown) => void);
	},
	loadExecutionMode: (strategyId) =>
		loadExecutionMode(db, strategyId ?? ""),
	isAlertSent: (eventId) => isAlertSent(db, eventId),
	saveAlert: (eventId, status) => saveAlert(db, eventId, status),
	sendSlackWebhook: (message) => {
		if (!slackWebhookUrl) {
			return Promise.resolve();
		}
		return sendSlackWebhook(slackWebhookUrl, message);
	},
	loadAlertContext: (eventId) => loadAlertContext(db, eventId),
	loadDecisionResult: (decisionId) => loadDecisionResult(db, decisionId),
});

console.log("Alert worker started");

// 6. Graceful shutdown on SIGTERM/SIGINT
async function shutdown(signal: string): Promise<void> {
	console.log(`Received ${signal}, shutting down...`);
	subscription.unsubscribe();
	await subscriber.close();
	await pool.end();
	process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
