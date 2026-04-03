import Decimal from "decimal.js";

// Configure global Decimal.js settings
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
});

export { Decimal };

// ─── Types ────────────────────────────────────────────────────────────────────

type DecimalInput = Decimal | string;

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a Decimal from a string or existing Decimal.
 * Never accepts raw number to enforce precision discipline.
 */
export function d(value: DecimalInput): Decimal {
  return new Decimal(value);
}

// ─── Arithmetic ───────────────────────────────────────────────────────────────

export function add(a: DecimalInput, b: DecimalInput): Decimal {
  return d(a).plus(d(b));
}

export function sub(a: DecimalInput, b: DecimalInput): Decimal {
  return d(a).minus(d(b));
}

export function mul(a: DecimalInput, b: DecimalInput): Decimal {
  return d(a).times(d(b));
}

/**
 * Divides a by b. Throws a descriptive error on division by zero.
 */
export function div(a: DecimalInput, b: DecimalInput): Decimal {
  const divisor = d(b);
  if (divisor.isZero()) {
    throw new Error(`Division by zero: cannot divide ${String(a)} by zero`);
  }
  return d(a).dividedBy(divisor);
}

export function abs(a: DecimalInput): Decimal {
  return d(a).abs();
}

export function neg(a: DecimalInput): Decimal {
  return d(a).negated();
}

export function min(...values: DecimalInput[]): Decimal {
  if (values.length === 0) {
    throw new Error("min() requires at least one argument");
  }
  return Decimal.min(...values.map(d));
}

export function max(...values: DecimalInput[]): Decimal {
  if (values.length === 0) {
    throw new Error("max() requires at least one argument");
  }
  return Decimal.max(...values.map(d));
}

// ─── Comparison ───────────────────────────────────────────────────────────────

export function eq(a: DecimalInput, b: DecimalInput): boolean {
  return d(a).equals(d(b));
}

export function gt(a: DecimalInput, b: DecimalInput): boolean {
  return d(a).greaterThan(d(b));
}

export function gte(a: DecimalInput, b: DecimalInput): boolean {
  return d(a).greaterThanOrEqualTo(d(b));
}

export function lt(a: DecimalInput, b: DecimalInput): boolean {
  return d(a).lessThan(d(b));
}

export function lte(a: DecimalInput, b: DecimalInput): boolean {
  return d(a).lessThanOrEqualTo(d(b));
}

export function isZero(a: DecimalInput): boolean {
  return d(a).isZero();
}

export function isPositive(a: DecimalInput): boolean {
  return d(a).isPositive() && !d(a).isZero();
}

export function isNegative(a: DecimalInput): boolean {
  return d(a).isNegative();
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function toFixed(value: DecimalInput, decimals: number): string {
  return d(value).toFixed(decimals);
}

/**
 * Formats a Decimal as a percentage string with the given decimal places.
 * The input value is treated as a ratio (e.g., 0.1234 → "12.34%").
 */
export function toPercent(value: DecimalInput, decimals = 2): string {
  return `${d(value).times("100").toFixed(decimals)}%`;
}

/**
 * Converts a Decimal to a native number.
 * WARNING: This loses precision — only use for display or external APIs
 * that require number. Never use for monetary calculations.
 */
export function toNumber(value: DecimalInput): number {
  return d(value).toNumber();
}

// ─── Percentage helpers ───────────────────────────────────────────────────────

/**
 * Calculates the percentage change from `from` to `to`.
 * Result is a ratio: 10% change → 0.1
 * Throws if `from` is zero.
 */
export function pctChange(from: DecimalInput, to: DecimalInput): Decimal {
  const fromDecimal = d(from);
  if (fromDecimal.isZero()) {
    throw new Error("pctChange: `from` value cannot be zero (division by zero)");
  }
  return d(to).minus(fromDecimal).dividedBy(fromDecimal);
}

/**
 * Returns `value * pct` — useful for calculating a percentage of a value.
 * e.g., pctOf('1000', '0.03') → 30 (3% of 1000)
 */
export function pctOf(value: DecimalInput, pct: DecimalInput): Decimal {
  return d(value).times(d(pct));
}
