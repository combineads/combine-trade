"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
	label: string;
	href: string;
	section: string;
}

const NAV_ITEMS: NavItem[] = [
	{ label: "Dashboard", href: "/dashboard", section: "OVERVIEW" },
	{ label: "Events", href: "/events", section: "OVERVIEW" },
	{ label: "Strategies", href: "/strategies", section: "TRADING" },
	{ label: "Orders", href: "/orders", section: "TRADING" },
	{ label: "Backtest", href: "/backtest", section: "ANALYSIS" },
	{ label: "Risk Management", href: "/risk", section: "SYSTEM" },
	{ label: "Alerts", href: "/alerts", section: "SYSTEM" },
	{ label: "Settings", href: "/settings", section: "SYSTEM" },
];

export function Sidebar() {
	const pathname = usePathname();
	const sections = [...new Set(NAV_ITEMS.map((item) => item.section))];

	return (
		<aside
			style={{
				width: "var(--sidebar-expanded)",
				backgroundColor: "var(--sidebar-bg)",
				borderRight: "1px solid var(--border-subtle)",
				height: "100vh",
				padding: "16px 0",
				display: "flex",
				flexDirection: "column",
				fontFamily: "var(--font-sans)",
			}}
		>
			<div
				style={{
					padding: "0 16px 24px",
					fontWeight: 700,
					fontSize: 18,
					color: "var(--color-primary)",
				}}
			>
				Combine Trade
			</div>
			<nav style={{ flex: 1 }}>
				{sections.map((section) => (
					<div key={section} style={{ marginBottom: 16 }}>
						<div
							style={{
								padding: "0 16px 8px",
								fontSize: 11,
								fontWeight: 600,
								textTransform: "uppercase",
								letterSpacing: "0.05em",
								color: "var(--text-muted)",
							}}
						>
							{section}
						</div>
						{NAV_ITEMS.filter((item) => item.section === section).map((item) => {
							const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
							return (
								<Link
									key={item.href}
									href={item.href}
									style={{
										display: "block",
										padding: "8px 16px",
										fontSize: 14,
										color: isActive ? "var(--color-primary)" : "var(--text-secondary)",
										backgroundColor: isActive ? "rgba(34, 197, 94, 0.10)" : "transparent",
										borderLeft: isActive
											? "3px solid var(--color-primary)"
											: "3px solid transparent",
										textDecoration: "none",
									}}
								>
									{item.label}
								</Link>
							);
						})}
					</div>
				))}
			</nav>
		</aside>
	);
}
