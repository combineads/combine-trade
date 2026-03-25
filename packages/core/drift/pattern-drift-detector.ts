import Decimal from "decimal.js";

/** Configuration for drift alert thresholds */
export interface DriftConfig {
	/** Drift score (0-100) at which a warning alert is triggered. Default: 60 */
	warningThreshold: number;
	/** Drift score (0-100) at which a critical alert is triggered. Default: 80 */
	criticalThreshold: number;
}

const DEFAULT_CONFIG: DriftConfig = {
	warningThreshold: 60,
	criticalThreshold: 80,
};

/** Minimum number of trades required in each window for drift analysis */
const MIN_WINDOW_SIZE = 30;

/**
 * Input for drift detection. Contains pre-aggregated win/loss counts for
 * baseline and recent windows, scoped to a single strategy+version+symbol.
 *
 * Callers are responsible for querying the appropriate scope from the DB
 * and passing the counts here. The detector does not perform DB access
 * (packages/core must not import Drizzle/Elysia/CCXT).
 */
export interface DriftInput {
	/** Strategy identifier — for scope annotation only */
	strategyId: string;
	/** Strategy version — for scope annotation only */
	version: number;
	/** Symbol — for scope annotation only */
	symbol: string;
	/** Number of winning trades in the baseline window */
	baselineWins: number;
	/** Number of losing trades in the baseline window */
	baselineLosses: number;
	/** Number of winning trades in the recent window */
	recentWins: number;
	/** Number of losing trades in the recent window */
	recentLosses: number;
}

/** Result of drift detection */
export interface DriftResult {
	/** Drift score in range 0–100. 0 = no drift, 100 = maximum divergence. */
	driftScore: number;
	/** Chi-squared statistic (df=1), computed with Decimal.js */
	chiSquared: Decimal;
	/** P-value from chi-squared test (df=1), computed with Decimal.js */
	pValue: Decimal;
	/** True when p-value < 0.05 */
	isSignificant: boolean;
	/** Alert level based on drift score vs configured thresholds */
	alertLevel: "none" | "warning" | "critical";
}

// ---------------------------------------------------------------------------
// Pure statistical helpers (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Compute the chi-squared statistic for a 2×2 contingency table comparing
 * win/loss distribution between baseline and recent windows.
 *
 * Table layout:
 *
 *           baseline   recent   total
 * wins      a          b        r1
 * losses    c          d        r2
 * total     c1         c2       N
 *
 * chi2 = N * (a*d - b*c)^2 / (r1 * r2 * c1 * c2)
 */
export function chiSquared(
	baselineWins: number,
	baselineLosses: number,
	recentWins: number,
	recentLosses: number,
): Decimal {
	const a = new Decimal(baselineWins);
	const b = new Decimal(recentWins);
	const c = new Decimal(baselineLosses);
	const d = new Decimal(recentLosses);

	const r1 = a.plus(b); // total wins
	const r2 = c.plus(d); // total losses
	const c1 = a.plus(c); // baseline total
	const c2 = b.plus(d); // recent total
	const N = r1.plus(r2); // grand total

	const denominator = r1.times(r2).times(c1).times(c2);

	if (denominator.isZero()) {
		return new Decimal(0);
	}

	const adMinusBc = a.times(d).minus(b.times(c));
	return N.times(adMinusBc.pow(2)).dividedBy(denominator);
}

/**
 * Approximate the p-value for a chi-squared statistic with 1 degree of freedom
 * using the regularized incomplete gamma function approximation.
 *
 * For df=1, p = 1 - Φ(sqrt(chi2)) * 2 + ... which simplifies to using the
 * complementary error function:  p = erfc(sqrt(chi2 / 2))
 *
 * We approximate erfc using a Horner-form rational approximation that is
 * accurate to within 1.5e-7 over [0, ∞) (Abramowitz & Stegun 7.1.26).
 *
 * All intermediate values are computed in Decimal.js, then the approximation
 * is applied using high-precision arithmetic before converting back.
 */
export function computePValue(chi2: Decimal): Decimal {
	if (chi2.isZero()) {
		return new Decimal(1);
	}

	// x = sqrt(chi2 / 2)
	const x = chi2.dividedBy(2).sqrt();
	const xNum = x.toNumber();

	// erfc approximation (Abramowitz & Stegun 7.1.26)
	const t = 1 / (1 + 0.3275911 * xNum);
	const poly =
		t *
		(0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
	const erfc = poly * Math.exp(-xNum * xNum);

	// Clamp to [0, 1]
	const pValue = Math.max(0, Math.min(1, erfc));
	return new Decimal(pValue.toFixed(10));
}

/**
 * Map a chi-squared statistic to a drift score in [0, 100].
 *
 * Mapping: score = min(100, chi2 / MAX_CHI2 * 100)
 * where MAX_CHI2 = 20 (chi2 far beyond any realistic significance boundary).
 *
 * This yields:
 *   chi2 = 0     → score = 0
 *   chi2 = 3.841 → score ≈ 19 (p=0.05 boundary)
 *   chi2 = 20    → score = 100
 *   chi2 > 20    → score = 100 (clamped)
 */
export function computeDriftScore(chi2: Decimal): Decimal {
	const MAX_CHI2 = new Decimal(20);
	const raw = chi2.dividedBy(MAX_CHI2).times(100);
	return Decimal.min(new Decimal(100), Decimal.max(new Decimal(0), raw));
}

// ---------------------------------------------------------------------------
// PatternDriftDetector
// ---------------------------------------------------------------------------

/**
 * Detect pattern drift by comparing win/loss distributions between a
 * historical baseline window and a recent window using a chi-squared test.
 *
 * The detector is a pure computation class — it does not access the database.
 * Callers must aggregate win/loss counts per scope (strategyId + version + symbol)
 * and provide them as DriftInput.
 */
export class PatternDriftDetector {
	private readonly config: DriftConfig;

	constructor(config: DriftConfig = DEFAULT_CONFIG) {
		this.config = config;
	}

	/**
	 * Compute drift for the provided baseline vs recent window.
	 *
	 * Returns a no-drift result (score=0, alertLevel='none') when either
	 * window has fewer than 30 trades (MIN_WINDOW_SIZE guard).
	 */
	detect(input: DriftInput): DriftResult {
		const baselineTotal = input.baselineWins + input.baselineLosses;
		const recentTotal = input.recentWins + input.recentLosses;

		// Minimum sample size guard — avoids false positives on sparse data
		if (baselineTotal < MIN_WINDOW_SIZE || recentTotal < MIN_WINDOW_SIZE) {
			return {
				driftScore: 0,
				chiSquared: new Decimal(0),
				pValue: new Decimal(1),
				isSignificant: false,
				alertLevel: "none",
			};
		}

		const chi2 = chiSquared(
			input.baselineWins,
			input.baselineLosses,
			input.recentWins,
			input.recentLosses,
		);

		const pValue = computePValue(chi2);
		const driftScoreDecimal = computeDriftScore(chi2);
		const driftScore = Math.round(driftScoreDecimal.toNumber() * 100) / 100;
		const isSignificant = pValue.toNumber() < 0.05;

		const alertLevel = this.resolveAlertLevel(driftScore);

		return {
			driftScore,
			chiSquared: chi2,
			pValue,
			isSignificant,
			alertLevel,
		};
	}

	private resolveAlertLevel(score: number): "none" | "warning" | "critical" {
		if (score >= this.config.criticalThreshold) return "critical";
		if (score >= this.config.warningThreshold) return "warning";
		return "none";
	}
}
