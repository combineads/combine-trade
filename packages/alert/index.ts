// Alert engine — Slack notification formatting and delivery tracking.
export { formatAlertMessage } from "./formatter.js";
export { sendSlackWebhook } from "./slack.js";
export type { AlertContext, SlackBlock, SlackMessage } from "./types.js";
