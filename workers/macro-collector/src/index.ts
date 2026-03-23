import { SavetickerClient } from "@combine/core/macro/saveticker-client.js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { CalendarCollector } from "./calendar-collector.js";
import { NewsCollector } from "./news-collector.js";
import { createCalendarEventRepository, createNewsEventRepository } from "./db.js";

// 1. Validate DATABASE_URL
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("DATABASE_URL not set");
	process.exit(1);
}

// 2. Warn if SAVETICKER_API_KEY is missing (public API fallback available)
if (!process.env.SAVETICKER_API_KEY) {
	console.warn("SAVETICKER_API_KEY not set — using public API fallback");
}

// 3. Create Drizzle db instance
const pool = postgres(databaseUrl);
const db = drizzle(pool);

// 4. Initialize SavetickerClient
const baseUrl = process.env.SAVETICKER_BASE_URL ?? "https://api.saveticker.com";
const client = new SavetickerClient({ baseUrl });

// 5. Initialize repositories
const calendarRepo = createCalendarEventRepository(db);
const newsRepo = createNewsEventRepository(db);

// 6. Initialize collectors
const calendarCollector = new CalendarCollector({
	fetchEvents: (start, end) => client.fetchCalendarEvents(start, end),
	repository: calendarRepo,
});

const newsCollector = new NewsCollector({
	fetchNews: (pageSize, afterTime) => client.fetchRecentNews(pageSize, afterTime),
	repository: newsRepo,
});

// 7. Run collectors once immediately on startup
void calendarCollector.collect().catch((err) => console.error("Initial calendar collection failed:", err));
void newsCollector.collectPendingEvents().catch((err) => console.error("Initial news collection failed:", err));

// 8. Schedule recurring collections
const calendarInterval = setInterval(
	() => void calendarCollector.collect().catch((err) => console.error("Calendar collection failed:", err)),
	60 * 60 * 1000, // every 60 minutes
);

const newsInterval = setInterval(
	() => void newsCollector.collectPendingEvents().catch((err) => console.error("News collection failed:", err)),
	30 * 60 * 1000, // every 30 minutes
);

console.log("Macro collector started. Collection scheduled.");

// 9. Graceful shutdown on SIGTERM/SIGINT
async function shutdown(signal: string): Promise<void> {
	console.log(`Received ${signal}, shutting down...`);
	clearInterval(calendarInterval);
	clearInterval(newsInterval);
	await pool.end();
	process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
