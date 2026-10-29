export const SUPPORTED_LOCALES = ['pt', 'en', 'es', 'de'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_LABELS: Record<SupportedLocale, { name: string; nativeName: string; short: string }> = {
  pt: { name: 'Português', nativeName: 'Português', short: 'PT' },
  en: { name: 'Inglês', nativeName: 'English', short: 'EN' },
  es: { name: 'Espanhol', nativeName: 'Español', short: 'ES' },
  de: { name: 'Alemão', nativeName: 'Deutsch', short: 'DE' },
};

export type TranslatableEntityType =
  | 'house'
  | 'region'
  | 'event'
  | 'adventure'
  | 'catalog_item'
  | 'record'
  | 'festival'
  | 'constitution';

export type DynamicTranslationRow = {
  id?: string;
  entity_type: TranslatableEntityType;
  entity_id: string;
  field_name: string;
  locale: SupportedLocale;
  translated_text: string;
  updated_at?: string;
};
