import React from 'react';
import { useTranslation } from '@/lib/i18n/context';
import { SUPPORTED_LOCALES, SupportedLocale } from '@/lib/i18n/types';

const flags: Record<SupportedLocale, React.ReactNode> = {
  pt: (
    <svg width="22" height="16" viewBox="0 0 22 16" xmlns="http://www.w3.org/2000/svg">
      <rect width="22" height="16" fill="#009b3a" />
      <polygon points="11,2 20,8 11,14 2,8" fill="#fedf00" />
      <circle cx="11" cy="8" r="3.5" fill="#002776" />
    </svg>
  ),
  en: (
    <svg width="22" height="16" viewBox="0 0 22 16" xmlns="http://www.w3.org/2000/svg">
      <rect width="22" height="16" fill="#012169" />
      <path d="M0,0 L22,16 M22,0 L0,16" stroke="#ffffff" strokeWidth="2" />
      <path d="M0,0 L22,16 M22,0 L0,16" stroke="#C8102E" strokeWidth="1" />
      <path d="M11,0 L11,16 M0,8 L22,8" stroke="#ffffff" strokeWidth="3" />
      <path d="M11,0 L11,16 M0,8 L22,8" stroke="#C8102E" strokeWidth="2" />
    </svg>
  ),
  es: (
    <svg width="22" height="16" viewBox="0 0 22 16" xmlns="http://www.w3.org/2000/svg">
      <rect width="22" height="4" fill="#AA151B" />
      <rect width="22" height="8" y="4" fill="#F1BF00" />
      <rect width="22" height="4" y="12" fill="#AA151B" />
      <circle cx="6" cy="8" r="2" fill="#AA151B" opacity="0.8" />
    </svg>
  ),
  de: (
    <svg width="22" height="16" viewBox="0 0 22 16" xmlns="http://www.w3.org/2000/svg">
      <rect width="22" height="5.33" fill="#000000" />
      <rect width="22" height="5.33" y="5.33" fill="#DD0000" />
      <rect width="22" height="5.34" y="10.66" fill="#FFCE00" />
    </svg>
  ),
};

const labels: Record<SupportedLocale, string> = {
  pt: 'Português (PT)',
  en: 'English (EN)',
  es: 'Español (ES)',
  de: 'Deutsch (DE)',
};

export function LanguageSwitcher() {
  const { locale, setLocale } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      {SUPPORTED_LOCALES.map((loc) => {
        const isActive = locale === loc;
        return (
          <button
            key={loc}
            type="button"
            title={labels[loc]}
            aria-label={labels[loc]}
            aria-pressed={isActive}
            onClick={() => setLocale(loc)}
            className="transition-all rounded-sm overflow-hidden"
            style={{
              opacity: isActive ? 1 : 0.65,
              border: isActive ? '1.5px solid #d6b265' : '1.5px solid transparent',
              boxShadow: isActive ? '0 0 8px rgba(214, 178, 101, 0.45)' : 'none',
              transform: isActive ? 'scale(1.06)' : 'scale(1)',
              cursor: 'pointer',
              display: 'flex',
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.opacity = '0.65';
            }}
          >
            {flags[loc]}
          </button>
        );
      })}
    </div>
  );
}
