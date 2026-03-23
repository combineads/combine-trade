import { Skeleton } from "./skeleton";

export interface ChartContainerProps {
	width?: string | number;
	height?: number;
	children?: React.ReactNode;
}

export function ChartContainer({ width = "100%", height = 400, children }: ChartContainerProps) {
	return (
		<div
			style={{
				width,
				height,
				backgroundColor: "var(--bg-card)",
				borderRadius: "var(--radius-md)",
				border: "1px solid var(--border-subtle)",
				overflow: "hidden",
				position: "relative",
			}}
		>
			{children ?? (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						height: "100%",
					}}
				>
					<Skeleton width="100%" height="100%" />
				</div>
			)}
		</div>
	);
}
