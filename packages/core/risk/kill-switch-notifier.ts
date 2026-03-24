import type { KillSwitchAuditEvent } from "./kill-switch-audit.js";

/**
 * Minimal Slack Block Kit block interface.
 * Avoids importing any external Slack SDK — core must stay free of third-party alert deps.
 */
export interface SlackBlock {
	type: string;
	text?: {
		type: string;
		text: string;
		emoji?: boolean;
	};
	fields?: Array<{
		type: string;
		text: string;
	}>;
}

/**
 * Injectable dependency interface for sending Slack notifications.
 * Wire this with the real Slack webhook client in the infrastructure layer.
 */
export interface KillSwitchNotifierDeps {
	/** Send a Slack Block Kit message. Never throws — failures handled by KillSwitchNotifier. */
	sendSlackMessage(blocks: SlackBlock[]): Promise<void>;
}

/**
 * Build a Slack Block Kit payload for a kill switch activation event.
 * Pure function — no side effects, no async.
 */
export function buildActivationMessage(event: KillSwitchAuditEvent): SlackBlock[] {
	const scopeLabel =
		event.scopeTarget != null ? `${event.scope} (${event.scopeTarget})` : event.scope;

	const positionsCount = event.positionsSnapshot.length;

	return [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: ":red_circle: Kill Switch ACTIVATED",
				emoji: true,
			},
		},
		{
			type: "section",
			fields: [
				{
					type: "mrkdwn",
					text: `*Trigger Type:*\n${event.triggerType}`,
				},
				{
					type: "mrkdwn",
					text: `*Scope:*\n${scopeLabel}`,
				},
				{
					type: "mrkdwn",
					text: `*Reason:*\n${event.triggerReason}`,
				},
				{
					type: "mrkdwn",
					text: `*Open Positions:*\n${positionsCount}`,
				},
				{
					type: "mrkdwn",
					text: `*Activated At:*\n${event.activatedAt.toISOString()}`,
				},
				{
					type: "mrkdwn",
					text: `*State ID:*\n${event.killSwitchStateId}`,
				},
			],
		},
	];
}

/**
 * Build a Slack Block Kit payload for a kill switch deactivation event.
 * Pure function — no side effects, no async.
 */
export function buildDeactivationMessage(event: KillSwitchAuditEvent): SlackBlock[] {
	const scopeLabel =
		event.scopeTarget != null ? `${event.scope} (${event.scopeTarget})` : event.scope;

	const deactivatedBy = event.deactivatedBy ?? "unknown";

	let durationText = "N/A";
	if (event.deactivatedAt != null) {
		const durationMs = event.deactivatedAt.getTime() - event.activatedAt.getTime();
		const durationSec = Math.floor(durationMs / 1000);
		const minutes = Math.floor(durationSec / 60);
		const seconds = durationSec % 60;
		durationText = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
	}

	return [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: ":large_green_circle: Kill Switch DEACTIVATED",
				emoji: true,
			},
		},
		{
			type: "section",
			fields: [
				{
					type: "mrkdwn",
					text: `*Deactivated By:*\n${deactivatedBy}`,
				},
				{
					type: "mrkdwn",
					text: `*Scope:*\n${scopeLabel}`,
				},
				{
					type: "mrkdwn",
					text: `*Active Duration:*\n${durationText}`,
				},
				{
					type: "mrkdwn",
					text: `*Trigger Type:*\n${event.triggerType}`,
				},
				{
					type: "mrkdwn",
					text: `*Deactivated At:*\n${event.deactivatedAt?.toISOString() ?? "N/A"}`,
				},
			],
		},
	];
}

/**
 * Sends Slack notifications for kill switch state changes.
 * All notification failures are caught and logged — never propagated to the caller
 * so that alert failures never block or interrupt trading logic.
 */
export class KillSwitchNotifier {
	private readonly deps: KillSwitchNotifierDeps;

	constructor(deps: KillSwitchNotifierDeps) {
		this.deps = deps;
	}

	/**
	 * Send a Slack notification for a kill switch activation.
	 * Never throws — errors are caught and logged.
	 */
	async notifyActivation(event: KillSwitchAuditEvent): Promise<void> {
		const blocks = buildActivationMessage(event);
		try {
			await this.deps.sendSlackMessage(blocks);
		} catch (err) {
			console.error("[KillSwitchNotifier] Failed to send activation notification:", err);
		}
	}

	/**
	 * Send a Slack notification for a kill switch deactivation.
	 * Never throws — errors are caught and logged.
	 */
	async notifyDeactivation(event: KillSwitchAuditEvent): Promise<void> {
		const blocks = buildDeactivationMessage(event);
		try {
			await this.deps.sendSlackMessage(blocks);
		} catch (err) {
			console.error("[KillSwitchNotifier] Failed to send deactivation notification:", err);
		}
	}
}
