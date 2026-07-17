import { sk, type TranslationTree } from './translations';

export const locale = 'sk-SK' as const;
export const translations: Record<typeof locale, TranslationTree> = { 'sk-SK': sk };

type LeafPaths<T> = T extends object
  ? { [K in keyof T & string]: T[K] extends object ? `${K}.${LeafPaths<T[K]>}` : K }[keyof T & string]
  : never;

export type TranslationKey = LeafPaths<TranslationTree>;

function getValue(key: string): string {
  const result = key.split('.').reduce<unknown>((value, segment) => {
    if (value && typeof value === 'object' && segment in value) return (value as Record<string, unknown>)[segment];
    return undefined;
  }, sk);
  return typeof result === 'string' ? result : key;
}

export function t(key: TranslationKey | string, variables: Record<string, string | number> = {}): string {
  return Object.entries(variables).reduce((value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)), getValue(key));
}

export function flattenTranslationKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return prefix ? [prefix] : [];
  return Object.entries(value).flatMap(([key, child]) => flattenTranslationKeys(child, prefix ? `${prefix}.${key}` : key));
}

export const translationKeys = flattenTranslationKeys(sk);
