/**
 * React hook providing locale-bound formatting functions.
 * Reads the current locale from next-intl's `useLocale()`.
 *
 * Usage:
 *   const fmt = useFormatters();
 *   fmt.formatPrice("1234.56", "USDT") // "1,234.56 USDT"
 */
"use client";

import { useLocale } from "next-intl";
import {
	formatDate,
	formatDateTime,
	formatNumber,
	formatPercent,
	formatPrice,
	formatRelativeTime,
} from "./formatters";
import type { DateStyle } from "./formatters";

export interface Formatters {
	/** Locale currently in use */
	locale: string;
	/** Format a number with locale-appropriate separators */
	formatNumber(
		value: number | string,
		options?: Intl.NumberFormatOptions,
	): string;
	/** Format a crypto price with currency suffix (default USDT) */
	formatPrice(value: number | string, currency?: string): string;
	/** Format a ratio (0–1) as a percentage string */
	formatPercent(value: number | string): string;
	/** Format a date as a locale-appropriate date string */
	formatDate(
		date: Date | string | number,
		style?: DateStyle,
	): string;
	/** Format a date+time as a locale-appropriate string */
	formatDateTime(date: Date | string | number): string;
	/** Format a date as a relative time string ("3분 전", "3 minutes ago") */
	formatRelativeTime(date: Date | string | number): string;
}

/**
 * Returns locale-bound formatting functions using the current next-intl locale.
 * Must be called inside a next-intl `NextIntlClientProvider`.
 */
export function useFormatters(): Formatters {
	const locale = useLocale();

	return {
		locale,
		formatNumber: (value, options) => formatNumber(value, locale, options),
		formatPrice: (value, currency) => formatPrice(value, locale, currency),
		formatPercent: (value) => formatPercent(value, locale),
		formatDate: (date, style) => formatDate(date, locale, style),
		formatDateTime: (date) => formatDateTime(date, locale),
		formatRelativeTime: (date) => formatRelativeTime(date, locale),
	};
}
