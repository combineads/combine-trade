export interface FeatureConfig {
	name: string;
	normalization: string;
}

export interface SearchConfig {
	topK: number;
	similarityThreshold: number;
	minSamples: number;
}

export interface ResultConfig {
	takeProfitPct: number;
	stopLossPct: number;
	maxHoldBars: number;
}

export interface DecisionConfig {
	minWinrate: number;
	minExpectancy: number;
}

export interface StrategyConfig {
	features: FeatureConfig[];
	search: SearchConfig;
	result: ResultConfig;
	decision: DecisionConfig;
}

export interface ConfigPanelsProps {
	name: string;
	direction: string;
	symbols: string[];
	timeframes: string[];
	config: StrategyConfig;
	mode: string;
}

const sectionStyle: React.CSSProperties = {
	marginBottom: 16,
	padding: 12,
	backgroundColor: "var(--bg-elevated)",
	borderRadius: "var(--radius-md)",
};

const labelStyle: React.CSSProperties = {
	fontSize: 11,
	color: "var(--text-muted)",
	marginBottom: 4,
	textTransform: "uppercase" as const,
	letterSpacing: "0.05em",
};

const valueStyle: React.CSSProperties = {
	fontSize: 13,
	color: "var(--text-primary)",
	fontFamily: "var(--font-mono)",
};

const headingStyle: React.CSSProperties = {
	fontSize: 12,
	fontWeight: 600,
	color: "var(--text-secondary)",
	marginBottom: 8,
	textTransform: "uppercase" as const,
	letterSpacing: "0.05em",
};

function Field({ label, value }: { label: string; value: string | number }) {
	return (
		<div style={{ marginBottom: 8 }}>
			<div style={labelStyle}>{label}</div>
			<div style={valueStyle}>{String(value)}</div>
		</div>
	);
}

export function ConfigPanels({
	name,
	direction,
	symbols,
	timeframes,
	config,
	mode,
}: ConfigPanelsProps) {
	return (
		<div style={{ overflowY: "auto", height: "100%" }}>
			{/* 1. Basic Info */}
			<div style={sectionStyle}>
				<div style={headingStyle}>Basic Info</div>
				<Field label="Name" value={name} />
				<Field label="Direction" value={direction} />
				<div style={{ marginBottom: 8 }}>
					<div style={labelStyle}>Symbols</div>
					<div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
						{symbols.map((s) => (
							<span
								key={s}
								style={{
									fontSize: 11,
									fontFamily: "var(--font-mono)",
									padding: "2px 6px",
									borderRadius: "var(--radius-sm)",
									backgroundColor: "var(--bg-card)",
									color: "var(--text-secondary)",
								}}
							>
								{s}
							</span>
						))}
					</div>
				</div>
				<div style={{ marginBottom: 8 }}>
					<div style={labelStyle}>Timeframes</div>
					<div style={{ display: "flex", gap: 4 }}>
						{timeframes.map((t) => (
							<span key={t} style={{ ...valueStyle, fontSize: 12 }}>
								{t}
							</span>
						))}
					</div>
				</div>
			</div>

			{/* 2. Features & Vectorization */}
			<div style={sectionStyle}>
				<div style={headingStyle}>Features</div>
				{config.features.map((f) => (
					<div
						key={f.name}
						style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}
					>
						<span
							style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}
						>
							{f.name}
						</span>
						<span style={{ fontSize: 11, color: "var(--text-muted)" }}>{f.normalization}</span>
					</div>
				))}
			</div>

			{/* 3. Search Config */}
			<div style={sectionStyle}>
				<div style={headingStyle}>Search Config</div>
				<Field label="Top K" value={config.search.topK} />
				<Field label="Similarity Threshold" value={config.search.similarityThreshold} />
				<Field label="Min Samples" value={config.search.minSamples} />
			</div>

			{/* 4. Result Config */}
			<div style={sectionStyle}>
				<div style={headingStyle}>Result Config</div>
				<Field label="Take Profit %" value={config.result.takeProfitPct} />
				<Field label="Stop Loss %" value={config.result.stopLossPct} />
				<Field label="Max Hold Bars" value={config.result.maxHoldBars} />
			</div>

			{/* 5. Decision Config */}
			<div style={sectionStyle}>
				<div style={headingStyle}>Decision Config</div>
				<Field label="Min Winrate" value={config.decision.minWinrate} />
				<Field label="Min Expectancy" value={config.decision.minExpectancy} />
			</div>

			{/* 6. Execution Mode */}
			<div style={sectionStyle}>
				<div style={headingStyle}>Execution Mode</div>
				<div
					style={{
						fontSize: 13,
						fontWeight: 600,
						color: mode === "auto-trade" ? "var(--color-secondary)" : "var(--color-primary)",
					}}
				>
					{mode}
				</div>
			</div>
		</div>
	);
}
