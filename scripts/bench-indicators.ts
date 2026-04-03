import { d } from "@/core/decimal";
import type { Candle } from "@/core/types";
import { calcAllIndicators } from "@/indicators";

// Generate synthetic candles
function generateCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  let price = 85000;
  for (let i = 0; i < count; i++) {
    price += (Math.random() - 0.48) * 100; // slight upward drift
    const high = price + Math.random() * 50;
    const low = price - Math.random() * 50;
    candles.push({
      id: crypto.randomUUID(),
      symbol: "BTCUSDT",
      exchange: "binance" as const,
      timeframe: "5M" as const,
      open_time: new Date(Date.now() - (count - i) * 300_000),
      open: d(price.toFixed(2)),
      high: d(high.toFixed(2)),
      low: d(low.toFixed(2)),
      close: d(price.toFixed(2)),
      volume: d("1000"),
      is_closed: true,
      created_at: new Date(),
    });
  }
  return candles;
}

const CANDLE_COUNT = 120;
const ITERATIONS = 1000;

const candles = generateCandles(CANDLE_COUNT);
const times: number[] = [];

// Warmup
for (let i = 0; i < 10; i++) {
  calcAllIndicators(candles);
}

// Benchmark
for (let i = 0; i < ITERATIONS; i++) {
  const start = performance.now();
  calcAllIndicators(candles);
  times.push(performance.now() - start);
}

times.sort((a, b) => a - b);
const avg = times.reduce((a, b) => a + b, 0) / times.length;
const p50 = times[Math.floor(times.length * 0.5)];
const p95 = times[Math.floor(times.length * 0.95)];
const p99 = times[Math.floor(times.length * 0.99)];

console.log(`Benchmark: calcAllIndicators (${CANDLE_COUNT} candles × ${ITERATIONS} iterations)`);
console.log(`  avg: ${avg.toFixed(3)}ms`);
console.log(`  p50: ${p50?.toFixed(3)}ms`);
console.log(`  p95: ${p95?.toFixed(3)}ms`);
console.log(`  p99: ${p99?.toFixed(3)}ms`);

if (avg > 10) {
  console.error("FAIL: average exceeds 10ms budget");
  process.exit(1);
} else {
  console.log("PASS: within 10ms budget");
}
