// Theme
export { ThemeProvider, ThemeContext, type Theme, type ThemeContextValue, type ThemeProviderProps } from "./theme/theme-provider";
export { useTheme } from "./theme/use-theme";

// Components
export { Button, type ButtonVariant, type ButtonProps } from "./components/button";
export { StatusBadge, DirectionBadge, type BadgeStatus, type Direction, type StatusBadgeProps, type DirectionBadgeProps } from "./components/badge";
export { Card, type CardState, type CardProps } from "./components/card";
export { Skeleton, type SkeletonProps } from "./components/skeleton";
export { Pagination, type PaginationProps } from "./components/pagination";

// Views — Dashboard
export { DashboardView, type DashboardViewProps } from "./views/dashboard/dashboard-view";
export { KillSwitchCard, type KillSwitchCardProps } from "./views/dashboard/kill-switch-card";
export { StrategySummary, type StrategySummaryProps } from "./views/dashboard/strategy-summary";
export { RecentEvents, type RecentEventsProps } from "./views/dashboard/recent-events";
export { WorkerStatus, type WorkerStatusProps } from "./views/dashboard/worker-status";

// Views — Strategies
export { StrategyListView, type StrategyListViewProps, type StrategyListItem } from "./views/strategies/strategy-list-view";
export { StrategyCard, type StrategyCardProps } from "./views/strategies/strategy-card";
export { ModeSelector, type ModeSelectorProps, type ExecutionMode } from "./views/strategies/mode-selector";
export { StrategyEditorView, type StrategyEditorViewProps, type StrategyDetail } from "./views/strategies/strategy-editor-view";
export { ConfigPanels, type ConfigPanelsProps, type StrategyConfig, type FeatureConfig, type SearchConfig, type ResultConfig, type DecisionConfig } from "./views/strategies/config-panels";
export { StrategyStats, type StrategyStatsProps, type StrategyStatsData } from "./views/strategies/strategy-stats";

// Components — Dialog
export { ConfirmationDialog, type ConfirmationDialogProps } from "./components/confirmation-dialog";

// Components — Data
export { DataTable, type Column, type DataTableProps } from "./components/data-table";
export { FilterBar, type FilterOption, type FilterBarProps } from "./components/filter-bar";

// Views — Events
export { EventsView, type EventsViewProps, type EventRow } from "./views/events/events-view";

// Views — Orders
export { OrdersView, type OrdersViewProps, type OrderRow } from "./views/orders/orders-view";

// Views — Alerts
export { AlertsView, type AlertsViewProps, type AlertRow } from "./views/alerts/alerts-view";

// Views — Risk
export { RiskManagementView, type RiskManagementViewProps, type RiskState } from "./views/risk/risk-management-view";
export { KillSwitchControl, type KillSwitchControlProps } from "./views/risk/kill-switch-control";
export { LossLimitDisplay, type LossLimitDisplayProps, type LossLimitData } from "./views/risk/loss-limit-display";
export { AuditLog, type AuditLogProps, type AuditEntry } from "./views/risk/audit-log";

// Views — Charts
export { CandlestickChartView, type CandlestickChartViewProps } from "./views/charts/candlestick-chart-view";
export { TimeframeSelector, type Timeframe, type TimeframeSelectorProps } from "./views/charts/timeframe-selector";
export { EventMarker, TpSlOverlay, type MarkerType, type EventMarkerProps, type TpSlOverlayProps } from "./views/charts/event-markers";
export { SymbolSelector, type SymbolSelectorProps } from "./views/charts/symbol-selector";
export { LightweightChart, type OHLCVBar, type LightweightChartProps } from "./views/charts/lightweight-chart";
export { EquityCurveChart, type EquityCurvePoint, type EquityCurveChartProps } from "./views/charts/equity-curve-chart";

// Views — Backtest
export { TradeStats, type TradeStatsData, type TradeStatsProps } from "./views/backtest/trade-stats";
export { EquityCurve, type EquityPoint, type EquityCurveProps } from "./views/backtest/equity-curve";
export { PnlDistribution, type PnlBucket, type PnlDistributionProps } from "./views/backtest/pnl-distribution";
export { BacktestView, type BacktestStrategy, type BacktestViewProps } from "./views/backtest/backtest-view";
export { BacktestPage, type BacktestPageProps, type BacktestResult } from "./views/backtest/backtest-page";

// Components — Chart
export { ChartContainer, type ChartContainerProps } from "./components/chart-container";
export { ClientOnly, type ClientOnlyProps } from "./components/client-only";

// Views — Settings
export { SettingsView, type SettingsViewProps } from "./views/settings/settings-view";

// Views — Strategies (create)
export { StrategyCreateView, type StrategyCreateViewProps, type StrategyCreateInput, type StrategyDirection } from "./views/strategies/strategy-create-view";

// Components — Notification
export { NotificationBanner, KillSwitchBanner, type BannerVariant, type NotificationBannerProps } from "./components/notification-banner";

// Components — TopBar
export { TopBar, type TopBarProps } from "./components/top-bar";

// Hooks — SSE
export { useSSE, type SSEOptions, type SSEEvent, type UseSSEReturn, type SSEStatus } from "./hooks/use-sse";

// Views — Strategy Events
export { StrategyEventsTab, type StrategyEventsTabProps, type StrategyEvent, type EventOutcome } from "./views/strategies/strategy-events-tab";

// Components — Paper Trading
export { PaperTradingBanner, PaperBadge, PaperOrderCard, type PaperTradingBannerProps, type PaperOrderCardProps } from "./components/paper-trading-badge";

// Hooks — Candle Data
export { useCandleData, mergeBars, parseCandleResponse, type UseCandleDataOptions, type UseCandleDataResult } from "./hooks/use-candle-data";

// Views — Charts (overlay)
export { StrategyEventOverlay, type ChartStrategyEvent, type StrategyEventOverlayProps } from "./views/charts/strategy-event-overlay";

// API Client
export { createApiClient, buildQueryString, apiPaths, type ApiClient, type ApiClientConfig, type ApiError, type PaginatedResponse } from "./lib/api-client";
