import { Button } from "../../components/button";
import { StrategyCard } from "./strategy-card";

export interface StrategyListItem {
	id: string;
	name: string;
	status: string;
	mode: string;
	version: number;
	symbols: string[];
	direction: string;
	winrate: number;
	eventCount: number;
	createdAt: string;
}

export interface StrategyListViewProps {
	strategies: StrategyListItem[];
	onCreateClick?: () => void;
	onStrategyClick?: (id: string) => void;
}

export function StrategyListView({
	strategies,
	onCreateClick,
	onStrategyClick,
}: StrategyListViewProps) {
	return (
		<div>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 24,
				}}
			>
				<h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)" }}>Strategies</h1>
				<Button variant="primary" onClick={onCreateClick}>
					Create Strategy
				</Button>
			</div>

			{strategies.length === 0 ? (
				<div
					style={{
						textAlign: "center",
						padding: 48,
						color: "var(--text-muted)",
					}}
				>
					<div style={{ fontSize: 16, marginBottom: 8 }}>No strategies yet</div>
					<div style={{ fontSize: 13, marginBottom: 16 }}>
						Create your first trading strategy to get started.
					</div>
					<Button variant="primary" onClick={onCreateClick}>
						Create Strategy
					</Button>
				</div>
			) : (
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
						gap: 16,
					}}
				>
					{strategies.map((s) => (
						<StrategyCard
							key={s.id}
							strategy={s}
							onClick={onStrategyClick ? () => onStrategyClick(s.id) : undefined}
						/>
					))}
				</div>
			)}
		</div>
	);
}
