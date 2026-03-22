/**
 * Double-BB strategy script for sandbox execution.
 * This string is evaluated inside QuickJS — no imports, no async, no external modules.
 * All logic is inlined.
 *
 * Available globals (injected by executor):
 * - close[], open[], high[], low[], volume[], bar_index
 * - indicator.sma(), indicator.ema(), indicator.bb(), indicator.atr()
 * - defineFeature(name, value, normalization)
 * - setEntry(condition), setExit(condition)
 * - context { symbol, timeframe, direction }
 * - __preComputed { sma, ema, bb, atr, ... }
 */
export const DOUBLE_BB_SCRIPT = `
(function() {
	var i = bar_index;
	if (i < 20) return; // Need at least 20 bars for BB20

	// === Helper functions ===
	function abs(x) { return x < 0 ? -x : x; }
	function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
	function sigmoid(x, center, scale) {
		return 1 / (1 + Math.exp(-(x - center) / scale));
	}

	// === Read indicator data ===
	var bb20 = indicator.bb(close, 20, 2);
	var bb4 = indicator.bb(open, 4, 4);
	var sma20 = indicator.sma(close, 20);
	var sma50 = indicator.sma(close, 50);
	var sma100 = indicator.sma(close, 100);
	var sma200 = indicator.sma(close, 200);
	var atr14 = indicator.atr(14);

	// Current values
	var bb20Upper = bb20.upper[i] || 0;
	var bb20Middle = bb20.middle[i] || 0;
	var bb20Lower = bb20.lower[i] || 0;
	var bb4Upper = bb4.upper[i] || 0;
	var bb4Middle = bb4.middle[i] || 0;
	var bb4Lower = bb4.lower[i] || 0;

	var prevBb4Middle = (i > 0 && bb4.middle[i - 1]) || bb4Middle;
	var prevBb20Upper = (i > 0 && bb20.upper[i - 1]) || bb20Upper;
	var prevBb20Lower = (i > 0 && bb20.lower[i - 1]) || bb20Lower;

	var ma20Val = sma20[i] || 0;
	var ma50Val = sma50[i] || 0;
	var ma100Val = sma100[i] || 0;
	var ma200Val = sma200[i] || 0;
	var prevMa20 = (i > 0 && sma20[i - 1]) || ma20Val;
	var prevMa50 = (i > 0 && sma50[i - 1]) || ma50Val;
	var atrVal = atr14[i] || 0;

	var c = close[i];
	var o = open[i];
	var h = high[i];
	var l = low[i];
	var v = volume[i] || 0;

	if (!c || !o || !h || !l) return;

	var candleBody = abs(c - o);
	var candleRange = h - l;
	if (candleRange === 0) return;
	var bodyRatio = candleBody / candleRange;
	var isBullish = c > o;

	var bb20Width = bb20Upper - bb20Lower;
	if (bb20Width <= 0) return;

	// === Pattern Detection ===
	var patternVariant = null;
	var patternSide = null;

	// Breakout detection
	var prevBb20Width = prevBb20Upper - prevBb20Lower;
	var isExpanding = bb20Width > prevBb20Width;
	if (bodyRatio >= 0.6 && isExpanding) {
		if (c > bb20Upper && isBullish) {
			patternVariant = "breakout";
			patternSide = "bullish";
		} else if (c < bb20Lower && !isBullish) {
			patternVariant = "breakout";
			patternSide = "bearish";
		}
	}

	// Reversal detection
	if (!patternVariant) {
		var nearUpper = h >= bb20Upper - bb20Width * 0.15;
		var nearLower = l <= bb20Lower + bb20Width * 0.15;
		var lowerWick = Math.min(o, c) - l;
		var upperWick = h - Math.max(o, c);

		if (nearLower && lowerWick >= candleBody * 2) {
			patternVariant = "reversal";
			patternSide = "bullish";
		} else if (nearUpper && upperWick >= candleBody * 2) {
			patternVariant = "reversal";
			patternSide = "bearish";
		}
	}

	// Trend continuation detection
	if (!patternVariant) {
		var nearUpper2 = h >= bb20Upper - bb20Width * 0.15;
		var nearLower2 = l <= bb20Lower + bb20Width * 0.15;
		var bb4Up = bb4Middle > prevBb4Middle;
		var bb4Down = bb4Middle < prevBb4Middle;

		if (nearUpper2 && bb4Up) {
			patternVariant = "trend_continuation";
			patternSide = "bullish";
		} else if (nearLower2 && bb4Down) {
			patternVariant = "trend_continuation";
			patternSide = "bearish";
		}
	}

	// No pattern → exit
	if (!patternVariant) return;

	// === Direction Filter ===
	var dir = (context && context.direction) || "both";
	if (dir === "long" && patternSide === "bearish") return;
	if (dir === "short" && patternSide === "bullish") return;

	// === Evidence System ===
	var evidenceCount = 0;
	var candlePatternHit = false;
	var maOrderingHit = false;
	var maSlope = "flat";
	var separationDist = 0;
	var h1BiasValue = "neutral_bias";

	// Candle pattern evidence
	var candlePatternName = "none";
	if (bodyRatio <= 0.1) {
		candlePatternHit = true;
		candlePatternName = "doji";
	} else if (bodyRatio <= 0.35) {
		var lw = Math.min(o, c) - l;
		var uw = h - Math.max(o, c);
		if (patternSide === "bullish" && lw / candleRange >= 0.55) {
			candlePatternHit = true;
			candlePatternName = "hammer";
		} else if (patternSide === "bearish" && uw / candleRange >= 0.55) {
			candlePatternHit = true;
			candlePatternName = "inverted_hammer";
		}
	} else if (bodyRatio >= 0.7) {
		candlePatternHit = true;
		candlePatternName = "strong_body";
	}
	if (candlePatternHit) evidenceCount++;

	// MA evidence
	var ma20Rising = ma20Val > prevMa20;
	var ma50Rising = ma50Val > prevMa50;
	var ma20Falling = ma20Val < prevMa20;
	var ma50Falling = ma50Val < prevMa50;

	if (ma20Rising && ma50Rising) maSlope = "bullish";
	else if (ma20Falling && ma50Falling) maSlope = "bearish";

	if (patternSide === "bullish") {
		maOrderingHit = ma20Val > ma50Val && ma50Val > ma100Val && ma100Val > ma200Val;
	} else {
		maOrderingHit = ma20Val < ma50Val && ma50Val < ma100Val && ma100Val < ma200Val;
	}
	var slopeAligned = (patternSide === "bullish" && maSlope === "bullish") ||
		(patternSide === "bearish" && maSlope === "bearish");
	if (maOrderingHit && slopeAligned) evidenceCount++;

	// Separation evidence
	if (ma20Val !== 0) {
		separationDist = (c - ma20Val) / ma20Val;
		var sepHit = (patternSide === "bullish" && separationDist > 0) ||
			(patternSide === "bearish" && separationDist < 0);
		if (sepHit) evidenceCount++;
	}

	// 1h bias: simplified — use current TF data as proxy
	// In full implementation, this would use candle() to get 1h data
	// For now: aligned if MA slope matches side
	if (slopeAligned) {
		h1BiasValue = "aligned";
		evidenceCount++;
	} else if ((patternSide === "bullish" && maSlope === "bearish") ||
		(patternSide === "bearish" && maSlope === "bullish")) {
		h1BiasValue = "counter_trend";
	}

	// === Gate Check ===
	if (evidenceCount < 3) return;
	if (h1BiasValue === "counter_trend") return;

	// === Compute Features ===
	var variantMap = { "trend_continuation": 0.33, "reversal": 0.67, "breakout": 1.0 };
	var biasMap = { "counter_trend": 0, "neutral_bias": 0.5, "aligned": 1.0 };

	var f1 = variantMap[patternVariant] || 0;
	var f2 = candlePatternHit ? 1 : 0;
	var f3 = clamp01(sigmoid(maSlope === "bullish" ? 1 : (maSlope === "bearish" ? -1 : 0), 0, 0.5));
	var f4 = maOrderingHit ? 1 : 0;
	var f5 = (maOrderingHit && slopeAligned) ? 1 : 0;
	var f6 = clamp01(sigmoid(abs(separationDist), 0.01, 0.01));
	var f7 = biasMap[h1BiasValue] || 0.5;
	var f8 = bb20Width > 0 ? clamp01((c - bb20Lower) / bb20Width) : 0.5;

	// Volume ratio (use 20-bar average)
	var volSum = 0;
	var volCount = 0;
	for (var vi = Math.max(0, i - 19); vi <= i; vi++) {
		if (volume[vi]) { volSum += volume[vi]; volCount++; }
	}
	var avgVol = volCount > 0 ? volSum / volCount : 1;
	var volRatio = avgVol > 0 ? v / avgVol : 1;
	var f9 = clamp01(sigmoid(volRatio, 1, 0.5));

	// ATR range
	var atrRatio = atrVal > 0 ? candleRange / atrVal : 1;
	var f10 = clamp01(sigmoid(atrRatio, 1, 0.5));

	// === Define Features ===
	defineFeature("double_bb_variant", f1, { method: "none" });
	defineFeature("candle_pattern_score", f2, { method: "none" });
	defineFeature("ma_slope_score", f3, { method: "none" });
	defineFeature("ma_ordering_score", f4, { method: "none" });
	defineFeature("ma_reaction_score", f5, { method: "none" });
	defineFeature("separation_distance", f6, { method: "none" });
	defineFeature("h1_bias_alignment", f7, { method: "none" });
	defineFeature("price_in_bb20", f8, { method: "none" });
	defineFeature("volume_ratio", f9, { method: "none" });
	defineFeature("atr_range", f10, { method: "none" });

	// === Set Entry ===
	setEntry(true);
})();
`;
