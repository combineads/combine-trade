"use client";

import { type ReactNode, useEffect, useState } from "react";

export interface ClientOnlyProps {
	children: ReactNode;
	fallback?: ReactNode;
}

export function ClientOnly({ children, fallback }: ClientOnlyProps) {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		return <>{fallback ?? null}</>;
	}

	return <>{children}</>;
}
