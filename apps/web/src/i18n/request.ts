import { type Locale, defaultLocale, locales } from "@combine/ui/src/i18n/config";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
	// Validate the locale from the request
	let locale = await requestLocale;

	// Fall back to default if locale is not supported
	if (!locale || !routing.locales.includes(locale as Locale)) {
		locale = defaultLocale;
	}

	const { default: messages } = (await import(`@combine/ui/src/i18n/messages/${locale}.json`)) as {
		default: Record<string, unknown>;
	};

	return {
		locale,
		messages,
	};
});

// Re-export for convenience
export { locales, defaultLocale, type Locale };
