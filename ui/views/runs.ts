import type { I18nKey } from '../../shared/i18n.js';
import type { Ctx } from '../context.js';
import { h, table } from '../dom.js';
import type { PublicRun } from '../types.js';

/** "recette · http://…" for a run on a named target, else its URL. */
export const targetLabel = (r: PublicRun): string =>
  r.config?.target ? `${r.config.target} · ${r.targetUrl}` : r.targetUrl;

export async function runsView(ctx: Ctx): Promise<HTMLElement> {
  const { doc, t } = ctx;
  const { runs } = await ctx.api.get<{ runs: PublicRun[] }>('/api/runs');
  const body = runs.length
    ? table(
        doc,
        [
          t('runs.id'),
          t('runs.label'),
          t('runs.kind'),
          t('runs.status'),
          t('runs.target'),
          t('runs.created'),
        ],
        runs.map((r) => [
          h(doc, 'a', { href: `#/runs/${r.id}` }, r.id),
          r.label,
          t(`kind.${r.kind}` as I18nKey),
          h(
            doc,
            'span',
            { class: `status status-${r.status}` },
            t(`status.${r.status}` as I18nKey),
          ),
          targetLabel(r),
          new Date(r.createdAt).toLocaleString(ctx.locale),
        ]),
      )
    : h(doc, 'p', {}, t('runs.empty'));
  return h(doc, 'section', {}, h(doc, 'h1', {}, t('runs.title')), body);
}
