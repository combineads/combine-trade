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

// API Client
export { createApiClient, buildQueryString, apiPaths, type ApiClient, type ApiClientConfig, type ApiError, type PaginatedResponse } from "./lib/api-client";
