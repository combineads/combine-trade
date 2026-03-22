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

// API Client
export { createApiClient, buildQueryString, apiPaths, type ApiClient, type ApiClientConfig, type ApiError, type PaginatedResponse } from "./lib/api-client";
