"use client";

import { type ReactNode, createContext, useContext, useEffect, useState } from "react";
import { webAdapter } from "./web.js";

export interface PlatformAdapter {
	isDesktop: boolean;
	sendNotification(title: string, body: string): Promise<void>;
	storeRefreshToken(token: string): Promise<void>;
	getRefreshToken(): Promise<string | undefined>;
}

const PlatformContext = createContext<PlatformAdapter>(webAdapter);

export interface PlatformProviderProps {
	children: ReactNode;
}

export function PlatformProvider({ children }: PlatformProviderProps) {
	const [adapter, setAdapter] = useState<PlatformAdapter>(webAdapter);

	useEffect(() => {
		// SSR-safe Tauri detection: __TAURI_INTERNALS__ is injected by the Tauri WebView at runtime.
		// Dynamic import avoids bundling @tauri-apps/* into the web build.
		if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
			import("../platform/tauri.js")
				.then((mod) => {
					setAdapter(mod.tauriAdapter);
				})
				.catch(() => {
					// Tauri adapter unavailable; fall back to web adapter
				});
		}
	}, []);

	return <PlatformContext.Provider value={adapter}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformAdapter {
	return useContext(PlatformContext);
}
