"use client";

import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

export interface I18nProviderProps {
	/** Current locale, e.g. "ko" or "en". */
	locale: string;
	/** Compiled messages object for the given locale. */
	messages: Record<string, unknown>;
	/** Optional IANA time zone identifier, e.g. "Asia/Seoul". */
	timeZone?: string;
	children: ReactNode;
}

/**
 * I18nProvider — thin wrapper around NextIntlClientProvider.
 *
 * Accepts locale, messages, and optional timeZone so that both apps/web
 * (SSR) and apps/desktop (static export) can supply the same props.
 *
 * Use this at the root of any component tree that needs translations.
 */
export function I18nProvider({
	locale,
	messages,
	timeZone,
	children,
}: I18nProviderProps) {
	return (
		<NextIntlClientProvider
			locale={locale}
			messages={messages}
			timeZone={timeZone}
		>
			{children}
		</NextIntlClientProvider>
	);
}
