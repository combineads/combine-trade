"use client";

import { I18nProvider } from "@combine/ui";
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useState,
} from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOCALE_STORAGE_KEY = "combine-locale";
const DEFAULT_LOCALE = "ko";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DesktopLocale = "ko" | "en";

export interface LocaleContextValue {
	locale: DesktopLocale;
	setLocale: (locale: DesktopLocale) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const LocaleContext = createContext<LocaleContextValue>({
	locale: DEFAULT_LOCALE,
	setLocale: () => undefined,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitialLocale(): DesktopLocale {
	if (typeof window === "undefined") return DEFAULT_LOCALE;

	const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
	if (stored === "ko" || stored === "en") return stored;

	return DEFAULT_LOCALE;
}

async function loadMessages(locale: DesktopLocale): Promise<Record<string, unknown>> {
	// Dynamic import keeps the bundle lean — only the active locale is loaded.
	if (locale === "en") {
		const mod = await import("@combine/ui/src/i18n/messages/en.json");
		return mod.default as Record<string, unknown>;
	}
	const mod = await import("@combine/ui/src/i18n/messages/ko.json");
	return mod.default as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface LocaleProviderProps {
	children: ReactNode;
}

/**
 * LocaleProvider — desktop client-side locale manager.
 *
 * Reads the initial locale from localStorage under the key 'combine-locale'.
 * Falls back to 'ko' when no preference is stored.
 *
 * Exposes `locale` and `setLocale` via `LocaleContext`.
 * Wraps children with `I18nProvider` so that next-intl hooks work throughout
 * the desktop app without requiring URL-based locale routing.
 */
export function LocaleProvider({ children }: LocaleProviderProps) {
	const [locale, setLocaleState] = useState<DesktopLocale>(getInitialLocale);
	const [messages, setMessages] = useState<Record<string, unknown>>({});

	// Load messages whenever locale changes
	useEffect(() => {
		loadMessages(locale).then(setMessages).catch(() => {
			// If dynamic import fails, continue with empty messages rather than crashing
			setMessages({});
		});
	}, [locale]);

	const setLocale = useCallback((next: DesktopLocale) => {
		setLocaleState(next);
		if (typeof localStorage !== "undefined") {
			localStorage.setItem(LOCALE_STORAGE_KEY, next);
		}
	}, []);

	return (
		<LocaleContext.Provider value={{ locale, setLocale }}>
			<I18nProvider locale={locale} messages={messages}>
				{children}
			</I18nProvider>
		</LocaleContext.Provider>
	);
}
