import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Combine Trade",
	description: "Strategy-defined vectorization trading system",
	openGraph: {
		title: "Combine Trade",
		description: "Strategy-defined vectorization trading system",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "Combine Trade",
		description: "Strategy-defined vectorization trading system",
	},
};

/**
 * Root HTML shell. Locale-specific providers (I18nProvider, ThemeProvider,
 * AuthProviderWrapper) live in `[locale]/layout.tsx` so that the `lang`
 * attribute on <html> reflects the resolved locale.
 */
export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html suppressHydrationWarning>
			<body
				style={{
					margin: 0,
					backgroundColor: "var(--bg-base)",
					color: "var(--text-primary)",
					fontFamily: "var(--font-sans)",
				}}
			>
				{children}
			</body>
		</html>
	);
}
