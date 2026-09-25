import { translate, type I18nKey, type Locale } from '../shared/i18n.js';
import type { Api } from './api.js';

export interface Ctx {
  doc: Document;
  win: Window;
  api: Api;
  locale: Locale;
  t: (k: I18nKey, p?: Record<string, string | number>) => string;
  go: (route: string) => void;
}

export function makeT(locale: Locale) {
  return (k: I18nKey, p: Record<string, string | number> = {}) => translate(locale, k, p);
}
