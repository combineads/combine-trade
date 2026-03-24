import { createContext, useContext } from "react";
import enMessages from "./messages/en.json";
import koMessages from "./messages/ko.json";
import type { Locale } from "./glossary";

export type { Locale } from "./glossary";

// All messages indexed by locale
const MESSAGES: Record<Locale, typeof enMessages> = {
	ko: koMessages as typeof enMessages,
	en: enMessages,
};

/**
 * Retrieve a nested value from a messages object by dot-separated key path.
 * Returns the key path string as fallback if the key is not found.
 */
function getNestedValue(obj: Record<string, unknown>, keyPath: string): string {
	const parts = keyPath.split(".");
	let current: unknown = obj;
	for (const part of parts) {
		if (current == null || typeof current !== "object") {
			return keyPath;
		}
		current = (current as Record<string, unknown>)[part];
	}
	return typeof current === "string" ? current : keyPath;
}

/** Access translations for a given namespace. */
export function getTranslations(namespace: string, locale: Locale = "ko") {
	const messages = MESSAGES[locale] ?? MESSAGES.ko;
	const ns = (messages as Record<string, unknown>)[namespace];
	if (!ns || typeof ns !== "object") {
		return (key: string) => `${namespace}.${key}`;
	}

	return (key: string) => getNestedValue(ns as Record<string, unknown>, key);
}

// React context for locale
export interface I18nContextValue {
	locale: Locale;
	setLocale: (locale: Locale) => void;
}

// biome-ignore lint/style/noNonNullAssertion: context is always provided via I18nProvider
export const I18nContext = createContext<I18nContextValue>(null!);

/** React hook — returns a translator function for the given namespace.
 *
 * @param namespace - Top-level namespace key (e.g. 'strategies')
 * @param localeOverride - Optional locale override. When provided, skips context lookup.
 *   Useful for server-rendering components or tests that cannot provide a context.
 */
export function useTranslations(namespace: string, localeOverride?: Locale) {
	const ctx = useContext(I18nContext);
	const locale: Locale = localeOverride ?? ctx?.locale ?? "ko";
	return getTranslations(namespace, locale);
}

export { koMessages, enMessages };
