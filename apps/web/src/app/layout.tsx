import type { Metadata } from "next";
import { ThemeProvider } from "@combine/ui";
import { AuthProviderWrapper } from "@/components/auth-provider-wrapper";
import "./globals.css";

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
					<AuthProviderWrapper>
						{children}
					</AuthProviderWrapper>
				</ThemeProvider>
			</body>
		</html>
	);
}
