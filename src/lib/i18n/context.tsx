import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pt } from './locales/pt';
import { en } from './locales/en';
import { es } from './locales/es';
import { de } from './locales/de';
import { SupportedLocale, SUPPORTED_LOCALES, TranslatableEntityType } from './types';
import { loadDynamicTranslations } from './i18n.functions';

const translations = { pt, en, es, de };
type TranslationKey = string; // Using dot notation, e.g. "common.save"

interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  td: (entityType: TranslatableEntityType, entityId: string, fieldName: string, fallbackPtText: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>('pt');

  useEffect(() => {
    const saved = localStorage.getItem('cormyr-locale') as SupportedLocale;
    if (saved && SUPPORTED_LOCALES.includes(saved)) {
      setLocaleState(saved);
      document.documentElement.lang = saved;
    } else {
      document.documentElement.lang = 'pt';
    }
  }, []);

  const setLocale = (newLocale: SupportedLocale) => {
    setLocaleState(newLocale);
    localStorage.setItem('cormyr-locale', newLocale);
    document.documentElement.lang = newLocale;
  };

  const { data: dynamicTranslations = {} } = useQuery({
    queryKey: ['campaign-translations', locale],
    queryFn: async () => {
      if (locale === 'pt') return {};
      const result = await loadDynamicTranslations({ data: { locale } });
      return result || {};
    },
    enabled: locale !== 'pt',
    staleTime: 5 * 60 * 1000,
  });

  const value = useMemo(() => {
    const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
      const keys = key.split('.');

      const getVal = (loc: SupportedLocale) => {
        let current: any = translations[loc];
        for (const k of keys) {
          if (current === undefined) return undefined;
          current = current[k];
        }
        return typeof current === 'string' ? current : undefined;
      };

      let result = getVal(locale);
      if (result === undefined) {
        result = getVal('pt'); // fallback to pt
      }

      if (result === undefined) {
        return key; // fallback to key itself
      }

      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          result = result!.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
        });
      }

      return result;
    };

    const td = (entityType: TranslatableEntityType, entityId: string, fieldName: string, fallbackPtText: string): string => {
      if (locale === 'pt') return fallbackPtText;
      const dictKey = `${entityType}:${entityId}:${fieldName}`;
      const translated = dynamicTranslations[dictKey];
      return translated && translated.trim().length > 0 ? translated : fallbackPtText;
    };

    return { locale, setLocale, t, td };
  }, [locale, dynamicTranslations]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
}
