/**
 * Minimal useTranslations hook for packages/ui.
 *
 * This is a lightweight shim that resolves translation keys from
 * locale message files. It is designed to be replaced by next-intl
 * (T-22-001/T-22-002) once the full i18n infrastructure is in place.
 *
 * Usage:
 *   const t = useTranslations('strategies');
 *   t('pageTitle')            // "Strategies" | "전략"
 *   t('fields.name')          // "Strategy name" | "전략 이름"
 */

import type en from "./messages/en.json";
import type ko from "./messages/ko.json";

export type Locale = "ko" | "en";

/** Top-level namespace names present in message files */
export type Namespace = keyof typeof en;

type Messages = typeof en | typeof ko;

/**
 * Recursively build dot-separated key paths for a given namespace object.
 * e.g. { a: { b: "x" } } → "a" | "a.b"
 */
type DotPaths<T, Prefix extends string = ""> = T extends object
  ? {
      [K in keyof T & string]: K extends string
        ?
            | `${Prefix extends "" ? "" : `${Prefix}.`}${K}`
            | DotPaths<T[K], `${Prefix extends "" ? "" : `${Prefix}.`}${K}`>
        : never;
    }[keyof T & string]
  : never;

export type TranslationKey<N extends Namespace> = DotPaths<Messages[N]>;

/** Resolve a dot-path key inside a namespace object */
function resolve(obj: unknown, path: string): string {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return path;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : path;
}

/** Load messages for a given locale (synchronous, bundled at build time) */
function loadMessages(locale: Locale): Messages {
  if (locale === "ko") {
    // Dynamic require so bundlers can tree-shake unused locales
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./messages/ko.json") as Messages;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./messages/en.json") as Messages;
}

/**
 * Returns a translate function scoped to the given namespace.
 *
 * @param namespace - Top-level namespace key (e.g. 'strategies')
 * @param locale    - Active locale. Defaults to 'ko' (project default).
 */
export function useTranslations<N extends Namespace>(
  namespace: N,
  locale: Locale = "ko",
): (key: TranslationKey<N>) => string {
  const messages = loadMessages(locale);
  const ns = messages[namespace] as Record<string, unknown>;

  return (key: TranslationKey<N>): string => {
    return resolve(ns, key as string);
  };
}
