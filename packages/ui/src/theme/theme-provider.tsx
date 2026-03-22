"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "combine-trade-theme";
const DEFAULT_THEME: Theme = "dark";

export interface ThemeContextValue {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialTheme(): Theme {
	if (typeof window === "undefined") return DEFAULT_THEME;

	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === "dark" || stored === "light") return stored;

	if (window.matchMedia("(prefers-color-scheme: light)").matches) {
		return "light";
	}

	return DEFAULT_THEME;
}

export interface ThemeProviderProps {
	children: ReactNode;
	defaultTheme?: Theme;
}

export function ThemeProvider({ children, defaultTheme }: ThemeProviderProps) {
	const [theme, setThemeState] = useState<Theme>(
		defaultTheme ?? getInitialTheme,
	);

	const applyTheme = useCallback((newTheme: Theme) => {
		if (typeof document !== "undefined") {
			document.documentElement.setAttribute("data-theme", newTheme);
		}
		if (typeof localStorage !== "undefined") {
			localStorage.setItem(STORAGE_KEY, newTheme);
		}
	}, []);

	const setTheme = useCallback(
		(newTheme: Theme) => {
			setThemeState(newTheme);
			applyTheme(newTheme);
		},
		[applyTheme],
	);

	const toggleTheme = useCallback(() => {
		setTheme(theme === "dark" ? "light" : "dark");
	}, [theme, setTheme]);

	useEffect(() => {
		applyTheme(theme);
	}, [theme, applyTheme]);

	return (
		<ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
			{children}
		</ThemeContext.Provider>
	);
}
