import type { HTMLAttributes } from "react";

export type LogoVariant = "dark" | "light" | "auto";

export interface LogoProps extends HTMLAttributes<SVGElement> {
	/** @default "auto" */
	variant?: LogoVariant;
	/** Width and height in pixels. @default 32 */
	size?: number;
}

export function Logo({ variant = "auto", size = 32, ...props }: LogoProps) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 200 200"
			width={size}
			height={size}
			aria-label="Combine Trade"
			role="img"
			{...props}
		>
			{/* Red path — descending, drawn first (behind) */}
			<path
				d="M 30,55 C 82,55 118,145 170,145"
				stroke="#EF4444"
				strokeWidth="22"
				strokeLinecap="round"
				fill="none"
			/>
			{/* Green path — ascending, drawn second (on top) */}
			<path
				d="M 30,145 C 82,145 118,55 170,55"
				stroke="#22C55E"
				strokeWidth="22"
				strokeLinecap="round"
				fill="none"
			/>
		</svg>
	);
}
