export interface PnlBucket {
	range: string;
	count: number;
}

export interface PnlDistributionProps {
	buckets: PnlBucket[];
}

export function PnlDistribution({ buckets }: PnlDistributionProps) {
	if (buckets.length === 0) {
		return (
			<div style={{
				padding: 32,
				textAlign: "center",
				color: "var(--text-muted)",
				fontSize: 14,
			}}>
				No data
			</div>
		);
	}

	const maxCount = Math.max(...buckets.map((b) => b.count));

	return (
		<div style={{
			backgroundColor: "var(--bg-elevated)",
			borderRadius: "var(--radius-md)",
			padding: 16,
		}}>
			<div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--text-primary)" }}>
				P&L Distribution
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
				{buckets.map((bucket) => {
					const width = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
					const isNegative = bucket.range.startsWith("-");
					return (
						<div key={bucket.range} style={{ display: "flex", alignItems: "center", gap: 8 }}>
							<div style={{
								width: 90,
								fontSize: 11,
								fontFamily: "var(--font-mono)",
								color: "var(--text-muted)",
								textAlign: "right",
								flexShrink: 0,
							}}>
								{bucket.range}
							</div>
							<div style={{ flex: 1, height: 16, backgroundColor: "var(--bg-base)", borderRadius: 2 }}>
								<div style={{
									width: `${width}%`,
									height: "100%",
									backgroundColor: isNegative ? "#EF4444" : "#22C55E",
									borderRadius: 2,
								}} />
							</div>
							<div style={{
								width: 30,
								fontSize: 11,
								fontFamily: "var(--font-mono)",
								color: "var(--text-secondary)",
								textAlign: "right",
								flexShrink: 0,
							}}>
								{bucket.count}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
