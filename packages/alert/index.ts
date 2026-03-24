// Alert engine — Slack notification formatting and delivery tracking.
export { formatAlertMessage } from "./formatter.js";
export { sendSlackWebhook } from "./slack.js";
export type { AlertContext, SlackBlock, SlackMessage } from "./types.js";
export { AlertDeduplicator } from "./deduplicator.js";
export type { AlertDeduplicatorOptions, AlreadySeenStore } from "./deduplicator.js";
