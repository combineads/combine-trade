import { Elysia } from "elysia";

export const healthRoute = new Elysia().get("/api/v1/health", () => ({
	status: "ok" as const,
	timestamp: new Date().toISOString(),
}));
