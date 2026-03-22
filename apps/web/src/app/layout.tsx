import type { Metadata } from "next";
import { ThemeProvider, AuthProvider } from "@combine/ui";
import "./globals.css";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3100";

export const metadata: Metadata = {
	title: "Combine Trade",
	description: "Strategy-defined vectorization trading system",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en" data-theme="dark" suppressHydrationWarning>
			<body
				style={{
					margin: 0,
					backgroundColor: "var(--bg-base)",
					color: "var(--text-primary)",
					fontFamily: "var(--font-sans)",
				}}
			>
				<ThemeProvider defaultTheme="dark">
					<AuthProvider apiBaseUrl={API_BASE_URL}>
						{children}
					</AuthProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
