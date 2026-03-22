import Decimal from "decimal.js";

export type RoundingMode = "ROUND_DOWN" | "ROUND_HALF_UP";

export class ArithmeticError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ArithmeticError";
	}
}

export function add(a: string, b: string): string {
	return new Decimal(a).plus(new Decimal(b)).toString();
}

export function sub(a: string, b: string): string {
	return new Decimal(a).minus(new Decimal(b)).toString();
}

export function mul(a: string, b: string): string {
	return new Decimal(a).times(new Decimal(b)).toString();
}

export function div(a: string, b: string): string {
	const divisor = new Decimal(b);
	if (divisor.isZero()) {
		throw new ArithmeticError("Division by zero");
	}
	return new Decimal(a).div(divisor).toString();
}

export function round(value: string, decimalPlaces: number, mode: RoundingMode): string {
	const rounding = mode === "ROUND_DOWN" ? Decimal.ROUND_DOWN : Decimal.ROUND_HALF_UP;
	return new Decimal(value).toDecimalPlaces(decimalPlaces, rounding).toString();
}
