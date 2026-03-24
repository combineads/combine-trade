/**
 * Minimal useTranslations hook for packages/ui.
 *
 * Resolves translation keys from locale message files. Designed to be
 * compatible with the next-intl API shape so components can migrate
 * to next-intl once T-22-001/T-22-002 are integrated.
 *
 * Usage:
 *   const t = useTranslations('journal');
 *   t('pageTitle')              // "Trade Journal" | "트레이드 저널"
 *   t('entry.entryPrice')       // "Entry Price" | "진입가"
 */

import type en from "./messages/en.json";
import type ko from "./messages/ko.json";

export type Locale = "ko" | "en";

/** Top-level namespace names present in message files */
export type Namespace = keyof typeof en;

type Messages = typeof en | typeof ko;

/**
 * Recursively build dot-separated key paths for a given namespace object.
 * e.g. { a: { b: "x" } } → "a" | "a.b"
 */
type DotPaths<T, Prefix extends string = ""> = T extends object
	? {
			[K in keyof T & string]: K extends string
				?
						| `${Prefix extends "" ? "" : `${Prefix}.`}${K}`
						| DotPaths<T[K], `${Prefix extends "" ? "" : `${Prefix}.`}${K}`>
				: never;
		}[keyof T & string]
	: never;

export type TranslationKey<N extends Namespace> = DotPaths<Messages[N]>;

/** Resolve a dot-path key inside a namespace object */
function resolve(obj: unknown, path: string): string {
	const parts = path.split(".");
	let current: unknown = obj;
	for (const part of parts) {
		if (current == null || typeof current !== "object") return path;
		current = (current as Record<string, unknown>)[part];
	}
	return typeof current === "string" ? current : path;
}

/** Load messages for a given locale (synchronous, bundled at build time) */
function loadMessages(locale: Locale): Messages {
	if (locale === "ko") {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		return require("./messages/ko.json") as Messages;
	}
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	return require("./messages/en.json") as Messages;
}

/**
 * Returns a translate function scoped to the given namespace.
 *
 * @param namespace - Top-level namespace key (e.g. 'journal')
 * @param locale    - Active locale. Defaults to 'ko' (project default).
 */
export function useTranslations<N extends Namespace>(
	namespace: N,
	locale: Locale = "ko",
): (key: TranslationKey<N>) => string {
	const messages = loadMessages(locale);
	const ns = messages[namespace] as Record<string, unknown>;

	return (key: TranslationKey<N>): string => {
		return resolve(ns, key as string);
	};
}
