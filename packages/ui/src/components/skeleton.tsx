import type { CSSProperties } from "react";

export interface SkeletonProps {
	width: number | string;
	height: number | string;
	borderRadius?: number | string;
	style?: CSSProperties;
}

export function Skeleton({
	width,
	height,
	borderRadius = "var(--radius-sm)",
	style,
}: SkeletonProps) {
	return (
		<div
			style={{
				width: typeof width === "number" ? `${width}px` : width,
				height: typeof height === "number" ? `${height}px` : height,
				borderRadius,
				backgroundColor: "var(--skeleton-base)",
				animation: "pulse 1.5s ease-in-out infinite",
				...style,
			}}
		/>
	);
}
