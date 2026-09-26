import type { Scenario } from './scenario.js';
import type { Key, Lang } from './i18n.js';
import type { Board, User } from './store.js';

export interface View {
  lang: Lang;
  t: (k: Key) => string;
  scenario: Scenario;
  user: User | undefined;
  done: string | undefined;
  /** Which collapsible panel the page opens with (`?open=`), after a form reloaded it. */
  open: string | undefined;
  /** Path of the current page, without the query string. */
  path: string;
  consent: boolean;
  /** The signed-in user's boards (sidebar) and notes (notes panel). */
  boards: Board[];
  notes: string[];
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
export function button(v: View, key: Key, opts: { icon?: boolean } = {}): string {
  if (opts.icon && v.scenario.unnamedControls) {
    return `<button type="submit"><svg aria-hidden="true" width="16" height="16"><path d="M8 2v12M2 8h12"/></svg></button>`;
  }
  return `<button type="submit">${esc(v.t(key))}</button>`;
}

export function field(
  label: string,
  name: string,
  opts: { type?: string; required?: boolean; extra?: string } = {},
): string {
  const req = opts.required ? ' required' : '';
  const extra = opts.extra ? ` ${opts.extra}` : '';
  return `<label>${esc(label)} <input name="${name}" type="${opts.type ?? 'text'}"${req}${extra}></label>`;
}

/** A hidden input whose value is sent as parsed JSON (objects and arrays in request bodies). */
export const jsonInput = (name: string, value: unknown): string =>
  `<input type="hidden" name="${name}" data-json value="${esc(JSON.stringify(value))}">`;

export function apiForm(
  api: string,
  inner: string,
  opts: { redirect?: string; done?: string; id?: string; hidden?: boolean } = {},
): string {
  const redirect = opts.redirect ? ` data-redirect="${esc(opts.redirect)}"` : '';
  const done = opts.done ? ` data-done="${opts.done}"` : '';
  const id = opts.id ? ` id="${opts.id}"` : '';
  return `<form data-api="${api}"${id}${redirect}${done}${opts.hidden ? ' hidden' : ''} novalidate>${inner}</form>`;
}

/** A button that shows/hides the element `target` (Orqea's panels and modals). */
export const toggle = (label: string, target: string): string =>
  `<button type="button" data-action="toggle" data-target="${target}">${esc(label)}</button>`;

/** `hidden` unless the page was reloaded with `?open=<id>`. */
export const hiddenUnless = (v: View, id: string): string => (v.open === id ? '' : ' hidden');

function header(v: View): string {
  const { t } = v;
  if (!v.user)
    return `<header><a href="/">${t('brand')}</a> <a href="/login">${esc(t('signInLink'))}</a></header>`;
  const links: [string, Key][] = [
    ['/dashboard', 'home'],
    ['/calendar', 'calendar'],
    ['/qr', 'qr'],
    ['/billing', 'billing'],
    ['/settings', 'settings'],
    ['/profile', 'profile'],
  ];
  const nav = links.map(([href, k]) => `<a href="${href}">${esc(t(k))}</a>`).join(' ');
  // Orqea opens a board through a button (openBoard()), never a link.
  const boards = v.boards
    .map(
      (b) =>
        `<li><button type="button" data-action="go" data-href="/board/${b.id}">${esc(b.title)}</button></li>`,
    )
    .join('');
  return `<header><nav aria-label="${esc(t('nav'))}">${nav}<ul>${boards}</ul></nav>
<button type="button" aria-label="${esc(t('search'))}" data-action="toggle" data-target="search-dialog">⌕</button>
${toggle(t('notes'), 'notes-panel')}</header>${searchDialog(v)}${notesPanel(v)}`;
}

function searchDialog(v: View): string {
  return `<div id="search-dialog" role="dialog" aria-modal="true" aria-label="${esc(v.t('search'))}" hidden>
<input type="text" aria-label="${esc(v.t('searchPlaceholder'))}" data-search><ul data-search-results></ul></div>`;
}

function notesPanel(v: View): string {
  const form = apiForm(
    'POST /api/notes',
    `<textarea name="content" aria-label="${esc(v.t('newNote'))}"></textarea>${button(v, 'save')}`,
    { redirect: `${v.path}?open=notes-panel` },
  );
  const notes = v.notes.map((n) => `<li>${esc(n)}</li>`).join('');
  return `<div id="notes-panel"${hiddenUnless(v, 'notes-panel')}><ul>${notes}</ul>${form}</div>`;
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
  return text ? `<p role="status">${esc(text)}</p>` : '';
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
header{display:flex;flex-wrap:wrap;gap:1rem;align-items:center;padding:.5rem 1rem;background:#1d2330}header a{color:#fff}
header ul{display:inline-flex;gap:.5rem;list-style:none;margin:0;padding:0}
main{padding:1rem;max-width:960px;margin:auto}label{display:block;margin:.5rem 0}
section[data-list-id]{display:inline-block;vertical-align:top;min-width:180px;min-height:120px;background:#e8ebf0;margin:.25rem;padding:.5rem}
[role=alert]{color:#a30000}[role=status]{color:#0a6b2d}#cookie-banner,#paywall{position:fixed;bottom:0;left:0;right:0;background:#fff;padding:1rem;border-top:2px solid #1d2330}
#search-dialog,#notes-panel{background:#fff;padding:1rem;border:1px solid #1d2330;margin:.5rem 1rem}
`;
