import { translate, type I18nKey, type Locale } from '../../shared/i18n.js';
import type { CalibrationReport } from './calibration.js';
import type { ComparisonReport } from './compare.js';
import type { FunnelReport } from './funnel.js';
import type { LoadReport } from './load.js';
import type { ReportMeta } from './meta.js';
import type { PricingReport } from './pricing.js';

export type AnyReport =
  FunnelReport | ComparisonReport | LoadReport | PricingReport | CalibrationReport;
/** Returns a data: URI for a screenshot file, or null when it is gone. */
export type ImageSource = (file: string) => string | null;

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export const esc = (s: unknown): string => String(s).replace(/[&<>"']/g, (c) => ESC[c] as string);
const fmt = (v: number | null): string => (v === null ? '—' : String(v));

/** Trusted markup built by this module (never report content). */
interface Raw {
  html: string;
}
type Cell = string | number | null | Raw;

function table(head: string[], rows: Cell[][]): string {
  if (rows.length === 0) return '';
  const th = head.map((h) => `<th>${esc(h)}</th>`).join('');
  const td = (c: Cell) =>
    c !== null && typeof c === 'object' ? c.html : esc(fmt(c as number | null));
  const tr = rows.map((r) => `<tr>${r.map((c) => `<td>${td(c)}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

const list = (items: string[], empty: string): string =>
  items.length
    ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
    : `<p>${esc(empty)}</p>`;

function metaBlock(
  m: ReportMeta,
  t: (k: I18nKey, p?: Record<string, string | number>) => string,
): string {
  const rows: [I18nKey, string | number][] = [
    ['report.seed', m.seed],
    ['report.catalogue', m.catalogueVersion],
    ['report.weights', m.weightsVersion],
    ['report.target', `${m.targetVersion} (${m.targetUrl})`],
    ['report.duration', `${Math.round(m.durationMs / 1000)} s`],
  ];
  return `<section><h2>${esc(t('report.meta'))}</h2><p class="disclaimer">${esc(m.disclaimer)}</p><dl>${rows.map(([k, v]) => `<dt>${esc(t(k))}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
<h3>${esc(t('report.personas'))}</h3>${table(
    ['id', '%'],
    m.personas.map((p) => [`${p.displayName} (${p.id})`, Math.round(p.weight * 1000) / 10]),
  )}</section>`;
}

function funnel(
  r: FunnelReport,
  locale: Locale,
  t: (k: I18nKey) => string,
  img: ImageSource,
): string {
  const shot = (f: string | null) => {
    const src = f ? img(f) : null;
    return src
      ? { html: `<img alt="${esc(t('report.funnel.abandonShot'))}" src="${esc(src)}">` }
      : '—';
  };
  return `<h1>${esc(t('report.funnel.title'))}</h1>${metaBlock(r.meta, t)}
<section><h2>${esc(t('report.funnel.headline'))}</h2>${table(
    [t('report.funnel.step'), t('report.funnel.reached'), t('report.funnel.share')],
    r.headline.map((h) => [h.id, h.personas, h.weightedShare]),
  )}</section>
<section><h2>${esc(t('report.funnel.useCase'))}</h2>${table(
    [
      t('report.funnel.useCase'),
      t('report.funnel.attempted'),
      t('report.funnel.succeeded'),
      t('report.funnel.abandoned'),
      t('report.funnel.medianFriction'),
      t('report.funnel.reasons'),
      t('report.funnel.abandonShot'),
    ],
    r.useCases.map((u) => [
      u.title[locale],
      u.attempted,
      u.succeeded,
      u.abandoned,
      u.medianFriction,
      u.topAbandonReasons.map((x) => `${x.key} ×${x.count}`).join(', ') || '—',
      shot(u.abandonScreenshot),
    ]),
  )}</section>
<section><h2>${esc(t('report.funnel.personaTable'))}</h2>${table(
    [
      'id',
      t('report.funnel.stage'),
      t('report.funnel.sessions'),
      t('inspector.frustration'),
      t('inspector.rule'),
      t('report.funnel.money'),
    ],
    r.personas.map((p) => [
      p.id,
      p.stage,
      p.sessions,
      p.frustration,
      p.lastRule ?? '—',
      p.money.join('; ') || '—',
    ]),
  )}</section>
<section><h2>${esc(t('report.coverage'))}</h2><h3>${esc(t('report.coverage.useCases'))}</h3>${list(r.coverage.useCasesNeverAttempted, t('report.none'))}
<h3>${esc(t('report.coverage.endpoints'))}</h3>${list(r.coverage.endpointsNeverCalled, t('report.none'))}<h3>${esc(t('report.coverage.pages'))}</h3>${list(r.coverage.pagesSeen, t('report.none'))}</section>`;
}

function compare(r: ComparisonReport, t: (k: I18nKey) => string): string {
  const who = (xs: ComparisonReport['hurt']) =>
    list(
      xs.map((x) => `${x.personaId} · ${x.useCaseId}: ${x.why}`),
      t('report.none'),
    );
  return `<h1>${esc(t('report.compare.title'))}</h1><p>${esc(t(r.sameSeed ? 'report.compare.sameSeed' : 'report.compare.differentSeed'))}</p>
${metaBlock(r.a, t)}${metaBlock(r.b, t)}
<section><h2>${esc(t('report.compare.funnel'))}</h2>${table(
    [t('report.funnel.step'), 'A', 'B', 'Δ'],
    r.funnelDelta.map((d) => [d.id, d.a, d.b, d.delta]),
  )}</section>
<section><h2>${esc(t('report.compare.friction'))}</h2>${table(
    [t('report.funnel.useCase'), 'A', 'B', 'Δ'],
    r.frictionDelta.map((d) => [d.id, d.a, d.b, d.delta]),
  )}</section>
<section><h2>${esc(t('report.compare.hurt'))}</h2>${who(r.hurt)}<h2>${esc(t('report.compare.helped'))}</h2>${who(r.helped)}</section>`;
}

function load(
  r: LoadReport,
  t: (k: I18nKey, p?: Record<string, string | number>) => string,
): string {
  const scenarios = r.scenarios
    .map(
      (
        s,
      ) => `<section><h2>${esc(t('report.load.users', { n: s.users }))}</h2><p>${esc(t('report.load.objects'))}: ${s.objectsPerWeek} · ${esc(t('report.load.storage'))}: ${Math.round(s.storageGrowthBytesPerWeek / 1024)} KiB</p>
${table(
  [t('report.load.endpoint'), t('report.load.perWeek'), t('report.load.peak')],
  s.endpoints.map((e) => [e.endpoint, e.requestsPerWeek, e.peakRequestsPerSecond]),
)}</section>`,
    )
    .join('');
  return `<h1>${esc(t('report.load.title'))}</h1>${metaBlock(r.meta, t)}${scenarios}
<section><h2>${esc(t('report.load.latency'))}</h2>${table(
    [t('report.load.endpoint'), 'n', 'p50', 'p95', 'p99'],
    r.measuredLatency.map((l) => [l.endpoint, l.count, l.p50, l.p95, l.p99]),
  )}</section>`;
}

function pricing(r: PricingReport, t: (k: I18nKey) => string): string {
  const s = r.scenarios
    .map(
      (
        sc,
      ) => `<section><h2>${esc(t('report.pricing.scenario'))}: ${esc(sc.name)}</h2><p>${esc(t('report.pricing.conversion'))}: ${sc.weightedConversion} · ${esc(t('report.pricing.revenue'))}: ${sc.revenuePer1000Users} €</p>
${table(
  ['id', t('inspector.decision'), 'plan', '€'],
  sc.personas.map((p) => [p.id, p.decision, p.planKey ?? '—', p.monthlyCost]),
)}</section>`,
    )
    .join('');
  return `<h1>${esc(t('report.pricing.title'))}</h1>${metaBlock(r.meta, t)}${s}<section><h2>${esc(t('report.pricing.triggers'))}</h2>${list(
    r.paywallTriggers.map((x) => `${x.featureKey} ×${x.count}`),
    t('report.none'),
  )}</section>`;
}

function calibration(r: CalibrationReport, t: (k: I18nKey) => string): string {
  return `<h1>${esc(t('report.calibration.title'))}</h1><p>${esc(r.note)}</p>${table(
    [
      t('report.funnel.step'),
      t('report.calibration.simulated'),
      t('report.calibration.real'),
      t('report.calibration.delta'),
    ],
    r.rows.map((x) => [x.step, x.simulated, x.real, x.delta]),
  )}
<h2>${esc(t('report.calibration.suggestions'))}</h2>${list(
    r.suggestions.map((s) => `${s.direction} ${s.personaId}: ${s.because}`),
    t('report.none'),
  )}`;
}

const CSS = `body{font-family:system-ui,sans-serif;margin:2rem;color:#1b1f27;max-width:1200px}table{border-collapse:collapse;margin:.5rem 0}th,td{border:1px solid #c9ced8;padding:.25rem .5rem;text-align:left;vertical-align:top}
th{background:#eef1f5}.disclaimer{font-weight:600;border-left:4px solid #1f6feb;padding-left:.5rem}img{max-width:240px}dt{font-weight:600}dd{margin:0 0 .25rem}`;

/** Self-contained HTML (inline CSS, images as data URIs, no script). */
export function renderReportHtml(report: AnyReport, locale: Locale, img: ImageSource): string {
  const t = (k: I18nKey, p: Record<string, string | number> = {}) => translate(locale, k, p);
  const body =
    report.type === 'funnel'
      ? funnel(report, locale, t, img)
      : report.type === 'comparison'
        ? compare(report, t)
        : report.type === 'load'
          ? load(report, t)
          : report.type === 'pricing'
            ? pricing(report, t)
            : calibration(report, t);
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>Figura · ${esc(report.type)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}
