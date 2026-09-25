import type { Scenario } from './scenario.js';
import type { Key, Lang } from './i18n.js';
import type { User } from './store.js';

export interface View {
  lang: Lang;
  t: (k: Key) => string;
  scenario: Scenario;
  user: User | undefined;
  done: string | undefined;
  consent: boolean;
}

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c] as string);
}

/** A submit button; in the "unnamedControls" scenario, icon-only buttons lose their accessible name. */
export function button(v: View, key: Key, opts: { icon?: boolean; attrs?: string } = {}): string {
  const attrs = opts.attrs ? ` ${opts.attrs}` : '';
  if (opts.icon && v.scenario.unnamedControls) {
    return `<button type="submit"${attrs}><svg aria-hidden="true" width="16" height="16"><path d="M8 2v12M2 8h12"/></svg></button>`;
  }
  return `<button type="submit"${attrs}>${esc(v.t(key))}</button>`;
}

export function field(
  label: string,
  name: string,
  opts: {
    type?: string;
    required?: boolean;
    value?: string;
    textarea?: boolean;
    extra?: string;
  } = {},
): string {
  const req = opts.required ? ' required' : '';
  const extra = opts.extra ? ` ${opts.extra}` : '';
  const control = opts.textarea
    ? `<textarea name="${name}"${req}${extra}>${esc(opts.value ?? '')}</textarea>`
    : `<input name="${name}" type="${opts.type ?? 'text'}" value="${esc(opts.value ?? '')}"${req}${extra}>`;
  return `<label>${esc(label)} ${control}</label>`;
}

export function select(
  label: string,
  name: string,
  options: [string, string][],
  selected: string,
): string {
  const opts = options
    .map(
      ([value, text]) =>
        `<option value="${value}"${value === selected ? ' selected' : ''}>${esc(text)}</option>`,
    )
    .join('');
  return `<label>${esc(label)} <select name="${name}">${opts}</select></label>`;
}

export function apiForm(
  api: string,
  inner: string,
  opts: { redirect?: string; done?: string; data?: Record<string, string> } = {},
): string {
  const data = Object.entries(opts.data ?? {})
    .map(([k, val]) => ` data-${k}="${esc(val)}"`)
    .join('');
  const redirect = opts.redirect ? ` data-redirect="${esc(opts.redirect)}"` : '';
  const done = opts.done ? ` data-done="${opts.done}"` : '';
  return `<form data-api="${api}"${redirect}${done}${data} novalidate>${inner}</form>`;
}

function header(v: View): string {
  if (!v.user)
    return `<header><a href="/">${v.t('brand')}</a> <a href="/login">${esc(v.t('logIn'))}</a></header>`;
  const links: [string, Key][] = [
    ['/boards', 'boards'],
    ['/calendar', 'calendar'],
    ['/notes', 'notes'],
    ['/forms', 'forms'],
    ['/qr', 'qr'],
    ['/billing', 'billing'],
    ['/settings', 'settings'],
  ];
  const nav = links.map(([href, k]) => `<a href="${href}">${esc(v.t(k))}</a>`).join(' ');
  return `<header><nav aria-label="${esc(v.t('nav'))}">${nav}</nav>
<form action="/search" method="get" role="search"><input type="search" name="q" aria-label="${esc(v.t('search'))}"></form></header>`;
}

function cookieBanner(v: View): string {
  if (!v.scenario.cookieBanner || v.consent || v.user) return '';
  return `<div id="cookie-banner" role="dialog" aria-label="${esc(v.t('cookies'))}"><p>${esc(v.t('cookiesText'))}</p>
<button type="button" data-action="consent" data-value="all">${esc(v.t('acceptAll'))}</button>
<button type="button" data-action="consent" data-value="none">${esc(v.t('rejectAll'))}</button></div>`;
}

function flash(v: View): string {
  const key = `done_${v.done ?? ''}` as Key;
  const text = v.done ? v.t(key) : undefined;
  return text ? `<p role="status" aria-label="${esc(text)}">${esc(text)}</p>` : '';
}

function paywallDialog(v: View): string {
  return `<div id="paywall" role="alertdialog" aria-label="${esc(v.t('paywallTitle'))}" hidden><h2>${esc(v.t('paywallTitle'))}</h2>
<p>${esc(v.t('paywallText'))} <span data-feature></span></p><a href="/billing">${esc(v.t('seePlans'))}</a>
<button type="button" data-action="close-paywall">${esc(v.t('close'))}</button></div>`;
}

export function layout(v: View, title: string, body: string): string {
  return `<!doctype html><html lang="${v.lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} · Orqea</title>
<link rel="stylesheet" href="/static/app.css"><script src="/static/app.js" defer></script></head>
<body>${header(v)}${cookieBanner(v)}<main>${flash(v)}${body}</main>${paywallDialog(v)}</body></html>`;
}

export const CSS = `body{font-family:system-ui,sans-serif;margin:0;color:#1d2330;background:#f6f7f9}
header{display:flex;gap:1rem;align-items:center;padding:.5rem 1rem;background:#1d2330}header a{color:#fff}
main{padding:1rem;max-width:960px;margin:auto}label{display:block;margin:.5rem 0}
section[data-list-id]{display:inline-block;vertical-align:top;min-width:180px;min-height:120px;background:#e8ebf0;margin:.25rem;padding:.5rem}
[role=alert]{color:#a30000}[role=status]{color:#0a6b2d}#cookie-banner,#paywall{position:fixed;bottom:0;left:0;right:0;background:#fff;padding:1rem;border-top:2px solid #1d2330}
`;
