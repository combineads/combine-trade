# ADR-004: Economic Calendar Data Source

## Date
2026-04-05

## Status
Accepted

## Context
PRD §7.3 requires automatic trade block activation for 3-star (high-impact) economic events (e.g., FOMC, NFP, CPI). The system needs a reliable, automated source of upcoming economic event schedules so that TradeBlock records can be created in advance.

Alternatives considered:

- **Investing.com API (unofficial / scraping)**: Investing.com publishes a comprehensive economic calendar with star ratings (1–3). Many community projects scrape or use undocumented endpoints. Data quality is high and the site is the industry standard for retail traders.
- **Web scraping (direct HTML parse)**: Fragile — layout changes break parsers. Requires maintenance. Same data source as above but with higher operational risk.
- **Manual input**: Operator creates TradeBlock rows before each event. Zero operational complexity but requires human availability before every major release. Introduces human error risk and is not scalable.
- **Alternative APIs (Finnhub, Tradingeconomics, FRED)**: Finnhub and Tradingeconomics offer economic calendars via REST API with stable contracts, but their star/importance rating systems differ from Investing.com's convention. FRED provides raw economic data but no forward-looking calendar with impact ratings.

## Decision
Use the Investing.com economic calendar as the primary data source, accessed via HTTP scraping of the publicly available calendar page. The integration layer will be a dedicated adapter (`src/notifications/economic-calendar-adapter.ts`) that fetches the next 7 days of events and filters to importance === 3 (red/high-impact).

**Fail-closed policy**: if the data fetch fails for any reason (network error, parse failure, rate limit, structural change to the page), the system treats the failure as if a trade block is active. No new entries are opened until the calendar data is successfully refreshed. This ensures that missing data never silently allows a trade during a potentially volatile macro event.

The adapter must:
1. Retry up to 3 times with exponential backoff before declaring failure.
2. Log the failure with severity ERROR and trigger a notification alert.
3. Return an explicit `Result<TradeBlock[], CalendarFetchError>` type — never throw.
4. Cache the last successful fetch for up to 1 hour to reduce request frequency.

## Consequences
- Positive: No API key or subscription required for initial implementation.
- Positive: Fail-closed policy means safety is the default — a broken calendar integration cannot cause accidental live trading during macro events.
- Positive: Investing.com is the de facto reference for retail traders; data matches operator mental model.
- Negative: Scraping is fragile — Investing.com page structure changes can break the parser without warning.
- Negative: No official SLA or rate-limit documentation. Aggressive polling could result in IP blocks.
- Negative: Free tier does not provide an official API contract.
- Mitigation: Monitor fetch failures via EventLog. If scraping becomes unreliable, migrate to Tradingeconomics or Finnhub API with a minimal adapter swap — the port interface (`EconomicCalendarPort`) is the stable boundary.
