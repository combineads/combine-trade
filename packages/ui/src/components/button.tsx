import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant: ButtonVariant;
	children: ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, React.CSSProperties> = {
	primary: {
		backgroundColor: "#22C55E",
		color: "white",
		border: "none",
	},
	secondary: {
		backgroundColor: "transparent",
		color: "#EF4444",
		border: "1px solid #EF4444",
	},
	tertiary: {
		backgroundColor: "transparent",
		color: "var(--text-secondary)",
		border: "1px solid var(--border-subtle)",
	},
	danger: {
		backgroundColor: "#EF4444",
		color: "white",
		border: "none",
	},
};

export function Button({ variant, children, style, disabled, ...props }: ButtonProps) {
	return (
		<button
			type="button"
			disabled={disabled}
			style={{
				padding: "8px 16px",
				borderRadius: "var(--radius-md)",
				fontSize: 14,
				fontWeight: 500,
				fontFamily: "var(--font-sans)",
				cursor: disabled ? "not-allowed" : "pointer",
				opacity: disabled ? 0.5 : 1,
				...VARIANT_STYLES[variant],
				...style,
			}}
			{...props}
		>
			{children}
		</button>
	);
}
