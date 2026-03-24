import { defaultLocale } from "@combine/ui/src/i18n/config";
import { redirect } from "next/navigation";

/**
 * Root page — redirects to the default locale prefix.
 * The next-intl middleware handles locale detection before this runs,
 * so this is only a safety net for direct `/` access.
 */
export default function Home() {
	redirect(`/${defaultLocale}/dashboard`);
}
