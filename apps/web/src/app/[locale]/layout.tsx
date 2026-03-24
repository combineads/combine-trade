import { AuthProviderWrapper } from "@/components/auth-provider-wrapper";
import { I18nProvider } from "@combine/ui/src/i18n/I18nProvider";
import { type Locale, defaultLocale, locales } from "@combine/ui/src/i18n/config";
import { ThemeProvider } from "@combine/ui";
import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

interface LocaleLayoutProps {
	children: ReactNode;
	params: Promise<{ locale: string }>;
}

/**
 * Returns static locale params for generateStaticParams.
 * Allows Next.js to pre-render locale-prefixed paths at build time.
 */
export function generateStaticParams() {
	return locales.map((locale) => ({ locale }));
}

/**
 * Locale root layout.
 * Resolves the locale from URL params, loads messages, and wraps
 * children with I18nProvider, ThemeProvider, and AuthProviderWrapper.
 */
export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
	const { locale: rawLocale } = await params;

	// Validate — fall back to default if the segment is not a known locale
	const locale: Locale = (locales as readonly string[]).includes(rawLocale)
		? (rawLocale as Locale)
		: defaultLocale;

	// Required for next-intl static rendering support
	setRequestLocale(locale);

	const { default: messages } = (await import(
		`@combine/ui/src/i18n/messages/${locale}.json`
	)) as { default: Record<string, unknown> };

	return (
		<html lang={locale} data-theme="dark" suppressHydrationWarning>
			<body
				style={{
					margin: 0,
					backgroundColor: "var(--bg-base)",
					color: "var(--text-primary)",
					fontFamily: "var(--font-sans)",
				}}
			>
				<I18nProvider locale={locale} messages={messages} timeZone="Asia/Seoul">
					<ThemeProvider defaultTheme="dark">
						<AuthProviderWrapper>{children}</AuthProviderWrapper>
					</ThemeProvider>
				</I18nProvider>
			</body>
		</html>
	);
}
