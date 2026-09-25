import type { Ctx } from '../context.js';
import { h, table } from '../dom.js';
import type { Meta } from '../types.js';

export async function personasView(ctx: Ctx): Promise<HTMLElement> {
  const { doc, t } = ctx;
  const meta = await ctx.api.get<Meta>('/api/meta');
  return h(
    doc,
    'section',
    {},
    h(doc, 'h1', {}, t('nav.personas')),
    table(
      doc,
      [t('inspector.persona'), 'locale', 'device', '%', 'goal'],
      meta.personas.map((p) => [
        p.displayName,
        p.locale,
        p.device,
        String(Math.round(p.weight * 1000) / 10),
        p.goal,
      ]),
    ),
    h(
      doc,
      'p',
      {},
      `${t('report.catalogue')}: ${meta.catalogue.version} · ${t('report.weights')}: ${meta.weightsVersion}`,
    ),
  );
}
