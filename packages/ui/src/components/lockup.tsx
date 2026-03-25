"use client";

import type { HTMLAttributes } from "react";
import { useTheme } from "../theme/use-theme";
import { Logo, type LogoVariant } from "./logo";

export interface LockupProps extends HTMLAttributes<HTMLDivElement> {
	/** @default "auto" */
	variant?: LogoVariant;
	/** @default "md" */
	size?: "sm" | "md" | "lg";
}

const sizeConfig = {
	sm: { icon: 24, fontSize: 16, gap: 6 },
	md: { icon: 32, fontSize: 20, gap: 8 },
	lg: { icon: 48, fontSize: 28, gap: 12 },
} as const;

const COMBINE_COLOR = "#22C55E";
const TRADE_DARK = "#E2E8F0";
const TRADE_LIGHT = "#1E293B";

const FONT_FAMILY = "Inter, system-ui, sans-serif";

export function Lockup({ variant = "auto", size = "md", style, ...props }: LockupProps) {
	const { theme } = useTheme();

	const resolvedTheme = variant === "auto" ? theme : variant;
	const tradeColor = resolvedTheme === "dark" ? TRADE_DARK : TRADE_LIGHT;

	const { icon, fontSize, gap } = sizeConfig[size];

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: `${gap}px`,
				...style,
			}}
			{...props}
		>
			<Logo variant={variant} size={icon} />
			<span
				style={{
					fontFamily: FONT_FAMILY,
					fontSize: `${fontSize}px`,
					lineHeight: 1,
					whiteSpace: "nowrap",
				}}
			>
				<span style={{ color: COMBINE_COLOR, fontWeight: 600 }}>Combine</span>
				<span style={{ color: tradeColor, fontWeight: 400 }}>Trade</span>
			</span>
		</div>
	);
}
