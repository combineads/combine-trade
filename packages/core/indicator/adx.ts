import { Indicators } from "@ixjb94/indicators";
import type { ADXResult } from "./types.js";

const indicators = new Indicators();

/**
 * Average Directional Index (ADX with +DI and -DI).
 * Uses library DI calculation, then computes ADX via Wilder's smoothing of DX.
 */
export async function adx(
	high: number[],
	low: number[],
	close: number[],
	period = 14,
): Promise<ADXResult> {
	if (high.length < period * 2 + 1) return { adx: [], plusDI: [], minusDI: [] };

	const diResult = await indicators.di(high, low, close, period);
	const plusDI = diResult[0] ?? [];
	const minusDI = diResult[1] ?? [];

	if (plusDI.length === 0 || minusDI.length === 0) {
		return { adx: [], plusDI: [], minusDI: [] };
	}

	// Compute DX = |+DI - -DI| / (+DI + -DI) * 100
	const minLen = Math.min(plusDI.length, minusDI.length);
	const dx: number[] = [];
	for (let i = 0; i < minLen; i++) {
		const sum = plusDI[i]! + minusDI[i]!;
		dx.push(sum === 0 ? 0 : (Math.abs(plusDI[i]! - minusDI[i]!) / sum) * 100);
	}

	// Compute ADX as Wilder's smoothed DX over the period
	if (dx.length < period) return { adx: [], plusDI, minusDI };

	const adxValues: number[] = [];
	let adxSmoothed = 0;

	// First ADX = average of first `period` DX values
	for (let i = 0; i < period; i++) {
		adxSmoothed += dx[i]!;
	}
	adxSmoothed /= period;
	adxValues.push(adxSmoothed);

	// Subsequent ADX = ((prev ADX * (period - 1)) + current DX) / period
	for (let i = period; i < dx.length; i++) {
		adxSmoothed = (adxSmoothed * (period - 1) + dx[i]!) / period;
		adxValues.push(adxSmoothed);
	}

	return { adx: adxValues, plusDI, minusDI };
}
