/**
 * Shared i18n configuration for both apps/web and apps/desktop.
 * Defines supported locales, the default locale, and utility functions.
 */

export const locales = ["ko", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "ko";

/**
 * Returns true if the given string is a supported locale.
 */
export function isValidLocale(value: string): value is Locale {
	return (locales as readonly string[]).includes(value);
}
