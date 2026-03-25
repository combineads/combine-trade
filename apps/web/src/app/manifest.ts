import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Combine Trade",
		short_name: "CombineTrade",
		description: "Strategy-defined vectorization trading system",
		start_url: "/",
		display: "standalone",
		background_color: "#0A0A0F",
		theme_color: "#0A0A0F",
		icons: [
			{
				src: "/icons/icon-192x192.png",
				sizes: "192x192",
				type: "image/png",
				purpose: "any maskable",
			},
			{
				src: "/icons/icon-512x512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "any maskable",
			},
		],
	};
}
