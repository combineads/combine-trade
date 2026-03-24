"use client";

import { useLocale } from "../../i18n/hooks";
import { locales, type Locale } from "../../i18n/config";
import { usePlatform } from "../../platform/index";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const LOCALE_STORAGE_KEY = "combine-locale";

export const LOCALE_LABELS: Record<Locale, string> = {
	ko: "한국어",
	en: "English",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LanguageSwitcherProps {
	/** Called when the user selects a different locale. */
	onLocaleChange: (locale: Locale) => void;
	/** Optional CSS class for the container element. */
	className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * LanguageSwitcher — displays the current locale and lets the user switch
 * between supported locales (ko ↔ en).
 *
 * Platform branching:
 * - Web: calls onLocaleChange; the caller is responsible for URL-based routing
 *   (e.g., next-intl router.push with the new locale prefix).
 * - Desktop: persists the chosen locale to localStorage under 'combine-locale'
 *   before calling onLocaleChange; the caller passes LocaleContext.setLocale.
 *
 * The component itself only stores to localStorage when running on desktop
 * (isDesktop === true). Web locale persistence is handled by next-intl's
 * URL routing.
 */
export function LanguageSwitcher({ onLocaleChange, className }: LanguageSwitcherProps) {
	const currentLocale = useLocale() as Locale;
	const { isDesktop } = usePlatform();

	function handleChange(locale: Locale) {
		if (locale === currentLocale) return;

		if (isDesktop && typeof localStorage !== "undefined") {
			localStorage.setItem(LOCALE_STORAGE_KEY, locale);
		}

		onLocaleChange(locale);
	}

	return (
		<div
			className={className}
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 4,
				fontFamily: "var(--font-sans)",
			}}
		>
			{locales.map((locale) => (
				<button
					key={locale}
					type="button"
					aria-pressed={locale === currentLocale}
					onClick={() => handleChange(locale)}
					style={{
						padding: "4px 10px",
						fontSize: 12,
						fontWeight: locale === currentLocale ? 600 : 400,
						fontFamily: "var(--font-sans)",
						cursor: locale === currentLocale ? "default" : "pointer",
						color:
							locale === currentLocale
								? "var(--color-primary, #22C55E)"
								: "var(--text-secondary, #94A3B8)",
						backgroundColor: "transparent",
						border:
							locale === currentLocale
								? "1px solid var(--color-primary, #22C55E)"
								: "1px solid transparent",
						borderRadius: "var(--radius-sm, 4px)",
						transition: "color 0.15s, border-color 0.15s",
					}}
				>
					{LOCALE_LABELS[locale]}
				</button>
			))}
		</div>
	);
}
