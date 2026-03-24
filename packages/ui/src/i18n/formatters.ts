/**
 * Locale-aware formatting utilities for numbers, prices, percentages, and dates.
 *
 * These are pure display functions only — no arithmetic.
 * All monetary calculations must use Decimal.js before passing values here.
 * String inputs are accepted for Decimal.js compatibility (e.g. "1234.56").
 *
 * Uses only built-in Intl APIs — no external date libraries.
 */

/**
 * Converts a string or number value to a JS number for Intl formatting.
 * Accepts Decimal.js `.toString()` output.
 */
function toNumber(value: number | string): number {
	if (typeof value === "string") {
		const parsed = Number(value);
		if (Number.isNaN(parsed)) {
			throw new RangeError(`formatters: invalid numeric string "${value}"`);
		}
		return parsed;
	}
	return value;
}

/**
 * Converts a date-like value to a Date instance.
 */
function toDate(date: Date | string | number): Date {
	if (date instanceof Date) return date;
	return new Date(date);
}

// ---------------------------------------------------------------------------
// formatNumber
// ---------------------------------------------------------------------------

/**
 * Formats a number with locale-appropriate thousand separators and decimal point.
 *
 * @param value  - Number or Decimal.js string
 * @param locale - BCP 47 locale string (e.g. "ko", "en")
 * @param options - Additional Intl.NumberFormat options
 */
export function formatNumber(
	value: number | string,
	locale: string,
	options?: Intl.NumberFormatOptions,
): string {
	const n = toNumber(value);
	return new Intl.NumberFormat(locale, options).format(n);
}

// ---------------------------------------------------------------------------
// formatPrice
// ---------------------------------------------------------------------------

/**
 * Formats a price value with a crypto currency suffix (e.g. "1,234.56 USDT").
 * Default currency is USDT.
 *
 * @param value    - Number or Decimal.js string
 * @param locale   - BCP 47 locale string
 * @param currency - Currency ticker symbol (default: "USDT")
 */
export function formatPrice(
	value: number | string,
	locale: string,
	currency: string = "USDT",
): string {
	const n = toNumber(value);

	// Determine a reasonable fraction digit count based on the value magnitude.
	// Crypto prices can have many decimal places for small values (e.g. BTC sats).
	let fractionDigits: number;
	const abs = Math.abs(n);
	if (abs === 0) {
		fractionDigits = 2;
	} else if (abs >= 1) {
		// Use up to 8 significant decimal digits but at least 2
		fractionDigits = Math.min(8, Math.max(2, countDecimalPlaces(n)));
	} else {
		// Small values: preserve all significant decimals
		fractionDigits = Math.min(8, countDecimalPlaces(n));
	}

	const formatted = new Intl.NumberFormat(locale, {
		minimumFractionDigits: fractionDigits,
		maximumFractionDigits: fractionDigits,
	}).format(n);

	return `${formatted} ${currency}`;
}

/**
 * Returns the number of decimal places in a number.
 */
function countDecimalPlaces(n: number): number {
	const str = n.toString();
	const dotIndex = str.indexOf(".");
	if (dotIndex === -1) return 0;
	return str.length - dotIndex - 1;
}

// ---------------------------------------------------------------------------
// formatPercent
// ---------------------------------------------------------------------------

/**
 * Formats a ratio value (0–1) as a percentage string.
 * 0.1234 → "12.34%"
 *
 * @param value    - Ratio as number or Decimal.js string (0.1234 = 12.34%)
 * @param locale   - BCP 47 locale string
 */
export function formatPercent(
	value: number | string,
	locale: string,
): string {
	const n = toNumber(value);

	// Intl style "percent" multiplies by 100 automatically.
	// Determine decimal places from the input value * 100.
	const pct = n * 100;
	const decimalPlaces = countDecimalPlaces(
		Number(Math.abs(pct).toPrecision(15)),
	);
	const fractionDigits = Math.min(2, decimalPlaces);

	return new Intl.NumberFormat(locale, {
		style: "percent",
		minimumFractionDigits: fractionDigits,
		maximumFractionDigits: fractionDigits,
	}).format(n);
}

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

export type DateStyle = "short" | "medium" | "long";

/**
 * Formats a date value using locale-appropriate date style.
 *
 * ko medium: "2026년 3월 24일"  (uses Intl "long" for ko — "medium" renders as "2026. 3. 24.")
 * en medium: "Mar 24, 2026"
 *
 * @param date   - Date, ISO string, or numeric timestamp
 * @param locale - BCP 47 locale string
 * @param style  - "short" | "medium" (default) | "long"
 */
export function formatDate(
	date: Date | string | number,
	locale: string,
	style: DateStyle = "medium",
): string {
	const d = toDate(date);

	// Korean "medium" maps to Intl "long" because Intl "medium" for ko
	// produces "2026. 3. 24." whereas the expected format is "2026년 3월 24일".
	let intlStyle: Intl.DateTimeFormatOptions["dateStyle"];
	if (style === "short") {
		intlStyle = "short";
	} else if (style === "long") {
		intlStyle = "long";
	} else {
		// medium — use "long" for Korean to produce the Korean-natural date format
		const baseLang = locale.split("-")[0];
		intlStyle = baseLang === "ko" ? "long" : "medium";
	}

	return new Intl.DateTimeFormat(locale, {
		dateStyle: intlStyle,
		timeZone: "UTC",
	}).format(d);
}

// ---------------------------------------------------------------------------
// formatDateTime
// ---------------------------------------------------------------------------

/**
 * Formats a date+time value using locale-appropriate medium style.
 *
 * @param date   - Date, ISO string, or numeric timestamp
 * @param locale - BCP 47 locale string
 */
export function formatDateTime(
	date: Date | string | number,
	locale: string,
): string {
	const d = toDate(date);
	return new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "UTC",
	}).format(d);
}

// ---------------------------------------------------------------------------
// formatRelativeTime
// ---------------------------------------------------------------------------

const RELATIVE_TIME_THRESHOLDS: {
	unit: Intl.RelativeTimeFormatUnit;
	seconds: number;
}[] = [
	{ unit: "second", seconds: 60 },
	{ unit: "minute", seconds: 60 * 60 },
	{ unit: "hour", seconds: 60 * 60 * 24 },
	{ unit: "day", seconds: 60 * 60 * 24 * 7 },
	{ unit: "week", seconds: 60 * 60 * 24 * 30 },
	{ unit: "month", seconds: 60 * 60 * 24 * 365 },
	{ unit: "year", seconds: Number.POSITIVE_INFINITY },
];

/**
 * Formats a date as a relative time string.
 *
 * ko: "3분 전", en: "3 minutes ago"
 *
 * @param date   - Date, ISO string, or numeric timestamp
 * @param locale - BCP 47 locale string
 */
export function formatRelativeTime(
	date: Date | string | number,
	locale: string,
): string {
	const d = toDate(date);
	const now = Date.now();
	const diffSeconds = (d.getTime() - now) / 1000; // positive = future, negative = past
	const absDiff = Math.abs(diffSeconds);

	const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

	for (const { unit, seconds } of RELATIVE_TIME_THRESHOLDS) {
		if (absDiff < seconds) {
			const divisor =
				unit === "second"
					? 1
					: unit === "minute"
						? 60
						: unit === "hour"
							? 3600
							: unit === "day"
								? 86400
								: unit === "week"
									? 86400 * 7
									: unit === "month"
										? 86400 * 30
										: 86400 * 365;
			const value = Math.round(diffSeconds / divisor);
			return rtf.format(value, unit);
		}
	}

	// Fallback: format as years
	const value = Math.round(diffSeconds / (86400 * 365));
	return rtf.format(value, "year");
}
