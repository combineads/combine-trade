/** Sample strategy metadata fixture for testing */
export const sampleStrategyMeta = {
	id: "00000000-0000-0000-0000-000000000001",
	name: "SMA Cross",
	description: "Simple moving average crossover strategy",
	version: 1,
	apiVersion: "1.0" as const,
	executionMode: "paper" as const,
	config: {
		fastPeriod: 10,
		slowPeriod: 20,
	},
	symbolScope: ["BTCUSDT", "ETHUSDT"],
};

/** Sample strategy code fixture (simplified) */
export const sampleStrategyCode = `
export function evaluate(candles, config) {
  const { fastPeriod, slowPeriod } = config;
  const closes = candles.map(c => parseFloat(c.close));

  if (closes.length < slowPeriod) return { direction: "PASS", reason: "insufficient_data" };

  const fastSma = closes.slice(-fastPeriod).reduce((a, b) => a + b, 0) / fastPeriod;
  const slowSma = closes.slice(-slowPeriod).reduce((a, b) => a + b, 0) / slowPeriod;

  if (fastSma > slowSma) return { direction: "LONG", reason: "golden_cross" };
  if (fastSma < slowSma) return { direction: "SHORT", reason: "death_cross" };
  return { direction: "PASS", reason: "no_signal" };
}
`;
