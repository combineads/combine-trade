import { and, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { createLogger } from "@/core/logger";
import { commonCodeTable } from "@/db/schema";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = createLogger("notifications");

// ---------------------------------------------------------------------------
// SlackEventType
// ---------------------------------------------------------------------------

export const SlackEventType = {
  ORDER_FILLED: "ORDER_FILLED",
  SL_REGISTERED: "SL_REGISTERED",
  SL_FAILED: "SL_FAILED",
  RECONCILIATION_MISMATCH: "RECONCILIATION_MISMATCH",
  LOSS_LIMIT_HIT: "LOSS_LIMIT_HIT",
  DAEMON_START: "DAEMON_START",
  DAEMON_STOP: "DAEMON_STOP",
  CRASH_RECOVERY: "CRASH_RECOVERY",
} as const;

export type SlackEventType = (typeof SlackEventType)[keyof typeof SlackEventType];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SlackAlertDetails = Record<string, string | number | boolean | undefined>;

type SlackBlock = Record<string, unknown>;

export type SlackPayload = {
  blocks?: SlackBlock[];
  attachments?: Array<{ color: string; blocks: SlackBlock[] }>;
};

// biome-ignore lint/suspicious/noExplicitAny: DB type varies by caller
type AnyDb = PgDatabase<any, any, any>;

// ---------------------------------------------------------------------------
// Color mapping
// ---------------------------------------------------------------------------

const COLOR_GREEN = "#2eb886";
const COLOR_ORANGE = "#f2c744";
const COLOR_RED = "#e01e5a";

const EVENT_COLORS: Record<SlackEventType, string> = {
  [SlackEventType.ORDER_FILLED]: COLOR_GREEN,
  [SlackEventType.SL_REGISTERED]: COLOR_GREEN,
  [SlackEventType.SL_FAILED]: COLOR_RED,
  [SlackEventType.RECONCILIATION_MISMATCH]: COLOR_RED,
  [SlackEventType.LOSS_LIMIT_HIT]: COLOR_ORANGE,
  [SlackEventType.DAEMON_START]: COLOR_GREEN,
  [SlackEventType.DAEMON_STOP]: COLOR_ORANGE,
  [SlackEventType.CRASH_RECOVERY]: COLOR_RED,
};

// ---------------------------------------------------------------------------
// Emoji mapping
// ---------------------------------------------------------------------------

const EVENT_EMOJIS: Record<SlackEventType, string> = {
  [SlackEventType.ORDER_FILLED]: ":white_check_mark:",
  [SlackEventType.SL_REGISTERED]: ":shield:",
  [SlackEventType.SL_FAILED]: ":rotating_light:",
  [SlackEventType.RECONCILIATION_MISMATCH]: ":warning:",
  [SlackEventType.LOSS_LIMIT_HIT]: ":no_entry:",
  [SlackEventType.DAEMON_START]: ":rocket:",
  [SlackEventType.DAEMON_STOP]: ":octagonal_sign:",
  [SlackEventType.CRASH_RECOVERY]: ":adhesive_bandage:",
};

// ---------------------------------------------------------------------------
// getWebhookUrl
// ---------------------------------------------------------------------------

/**
 * Resolves the Slack webhook URL.
 * Priority: env SLACK_WEBHOOK_URL > CommonCode NOTIFICATION.slack_webhook_url
 * Returns null when neither source has a value.
 */
export async function getWebhookUrl(db?: AnyDb): Promise<string | null> {
  // 1) Environment variable — highest priority
  const envUrl = process.env.SLACK_WEBHOOK_URL;
  if (envUrl !== undefined && envUrl !== "") {
    return envUrl;
  }

  // 2) CommonCode DB fallback
  if (db !== undefined) {
    try {
      const rows = await db
        .select({ value: commonCodeTable.value })
        .from(commonCodeTable)
        .where(
          and(
            eq(commonCodeTable.group_code, "NOTIFICATION"),
            eq(commonCodeTable.code, "slack_webhook_url"),
            eq(commonCodeTable.is_active, true),
          ),
        );

      const row = rows[0];
      if (row !== undefined) {
        const val = typeof row.value === "string" ? row.value : String(row.value);
        if (val !== "" && val !== "null" && val !== "undefined") {
          return val;
        }
      }
    } catch (err) {
      logger.warn("slack_webhook_url_db_lookup_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// formatMessage
// ---------------------------------------------------------------------------

/**
 * Builds a Slack Block Kit payload for the given event type and details.
 */
export function formatMessage(eventType: SlackEventType, details: SlackAlertDetails): SlackPayload {
  const emoji = EVENT_EMOJIS[eventType];
  const color = EVENT_COLORS[eventType];
  const timestamp = new Date().toISOString();

  // Header block
  const headerBlock: SlackBlock = {
    type: "header",
    text: {
      type: "plain_text",
      text: `${emoji} ${eventType}`,
      emoji: true,
    },
  };

  // Fields block — build from details
  const fieldElements: Array<{ type: string; text: string }> = [];

  for (const [key, value] of Object.entries(details)) {
    if (value !== undefined) {
      fieldElements.push({
        type: "mrkdwn",
        text: `*${key}:*\n${String(value)}`,
      });
    }
  }

  const blocks: SlackBlock[] = [headerBlock];

  if (fieldElements.length > 0) {
    blocks.push({
      type: "section",
      fields: fieldElements,
    });
  }

  // Context block with timestamp
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time_secs}|${timestamp}>`,
      },
    ],
  });

  return {
    blocks,
    attachments: [
      {
        color,
        blocks: [],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// sendSlackAlert
// ---------------------------------------------------------------------------

/**
 * Sends a Slack webhook alert. Fire-and-forget: never throws.
 * - URL not configured -> logger.debug() and return silently
 * - Webhook failure -> logger.warn(), never throw
 */
export async function sendSlackAlert(
  eventType: SlackEventType,
  details: SlackAlertDetails,
  db?: AnyDb,
): Promise<void> {
  try {
    const url = await getWebhookUrl(db);

    if (url === null) {
      logger.debug("slack_alert_skipped", { reason: "no_webhook_url", eventType });
      return;
    }

    const payload = formatMessage(eventType, details);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.warn("slack_webhook_non_200", {
        eventType,
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (err) {
    logger.warn("slack_webhook_failed", {
      eventType,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
