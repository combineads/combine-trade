import type { Timeframe } from "@combine/shared";

export const StrategyStatus = {
	Draft: "draft",
	Active: "active",
	Inactive: "inactive",
	Archived: "archived",
} as const;

export type StrategyStatus = (typeof StrategyStatus)[keyof typeof StrategyStatus];

export interface FeatureDefinition {
	name: string;
	expression: string;
	normalization: {
		method: "minmax" | "zscore" | "rank" | "none";
		lookback?: number;
	};
}

export interface Strategy {
	id: string;
	version: number;
	name: string;
	description: string | null;
	code: string;
	symbols: string[];
	timeframe: Timeframe;
	direction: "long" | "short" | "both";
	featuresDefinition: FeatureDefinition[];
	normalizationConfig: Record<string, unknown>;
	searchConfig: Record<string, unknown>;
	resultConfig: Record<string, unknown>;
	decisionConfig: Record<string, unknown>;
	executionMode: "analysis" | "paper" | "live";
	apiVersion: string | null;
	status: StrategyStatus;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
}

export interface CreateStrategyInput {
	name: string;
	description?: string;
	code: string;
	symbols: string[];
	timeframe: Timeframe;
	direction: "long" | "short" | "both";
	featuresDefinition: FeatureDefinition[];
	normalizationConfig: Record<string, unknown>;
	searchConfig: Record<string, unknown>;
	resultConfig: Record<string, unknown>;
	decisionConfig: Record<string, unknown>;
	executionMode?: "analysis" | "paper" | "live";
	apiVersion?: string;
}

export interface UpdateStrategyInput {
	name?: string;
	description?: string;
	code?: string;
	symbols?: string[];
	timeframe?: Timeframe;
	direction?: "long" | "short" | "both";
	featuresDefinition?: FeatureDefinition[];
	normalizationConfig?: Record<string, unknown>;
	searchConfig?: Record<string, unknown>;
	resultConfig?: Record<string, unknown>;
	decisionConfig?: Record<string, unknown>;
	executionMode?: "analysis" | "paper" | "live";
	apiVersion?: string;
}
