import type { DecisionResult } from "@combine/core/decision";
import { type ExecutionMode, isPaperMode } from "@combine/execution";
import type { AlertContext, SlackMessage } from "./types.js";

const PAPER_TAG = "[모의매매]";

/** Format a decision result into a Slack Block Kit message. Throws if decision is PASS. */
export function formatAlertMessage(
	result: DecisionResult,
	ctx: AlertContext,
	mode?: ExecutionMode,
): SlackMessage {
	if (result.decision === "PASS") {
		throw new Error("Cannot format alert for PASS decision");
	}

	const winratePct = (result.statistics.winrate * 100).toFixed(1);
	const prefix = isPaperMode(mode) ? `${PAPER_TAG} ` : "";

	return {
		blocks: [
			{
				type: "header",
				text: {
					type: "plain_text",
					text: `${prefix}${result.decision} ${ctx.symbol}`,
				},
			},
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: [
						`*Strategy:* ${ctx.strategyName}`,
						`*Timeframe:* ${ctx.timeframe}`,
						`*Entry:* ${ctx.entryPrice}`,
						`*TP:* ${ctx.tp}`,
						`*SL:* ${ctx.sl}`,
					].join("\n"),
				},
			},
			{
				type: "section",
				text: {
					type: "mrkdwn",
					text: [
						`*Winrate:* ${winratePct}%`,
						`*Expectancy:* ${result.statistics.expectancy.toFixed(4)}`,
						`*Samples:* ${result.statistics.sampleCount}`,
						`*CI:* ${result.ciLower.toFixed(3)}–${result.ciUpper.toFixed(3)}`,
						`*Confidence:* ${result.confidenceTier}`,
						`*Top Similarity:* ${ctx.topSimilarity}`,
					].join("\n"),
				},
			},
			{
				type: "divider",
			},
		],
	};
}
