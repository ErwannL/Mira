import type { Ctx } from '../context.js';
import { h } from '../dom.js';
import { ApiError } from '../api.js';
import type { Meta } from '../types.js';

function field(ctx: Ctx, label: string, control: HTMLElement): HTMLElement {
  return h(ctx.doc, 'label', {}, h(ctx.doc, 'span', {}, label), control);
}

/** Reads the form into a run config (only the fields the operator filled). */
export function readForm(form: HTMLFormElement): Record<string, unknown> {
  const v = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value.trim();
  const checked = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).checked;
  const personas = Array.from(
    form.querySelectorAll<HTMLInputElement>('input[name="persona"]:checked'),
  ).map((i) => i.value);
  const config: Record<string, unknown> = {
    kind: v('kind'),
    label: v('label'),
    targetUrl: v('targetUrl'),
    allowRemote: checked('allowRemote'),
    confirmHost: v('confirmHost') || null,
    personaIds: personas,
    totalSimulatedDays: Number(v('days')),
    minutesPerRound: Number(v('minutesPerRound')),
    targetUsers: Number(v('targetUsers')),
    allowCheckout: checked('allowCheckout'),
    fakeScenario: v('scenario') || null,
  };
  if (v('seed')) config.seed = Number(v('seed'));
  if (v('priceScenarios')) config.priceScenarios = JSON.parse(v('priceScenarios'));
  return config;
}

export async function newRunView(ctx: Ctx): Promise<HTMLElement> {
  const { doc, t } = ctx;
  const meta = await ctx.api.get<Meta>('/api/meta');
  const input = (name: string, value = '', type = 'text') => h(doc, 'input', { name, value, type });
  const alert = h(doc, 'p', { role: 'alert', hidden: true });
  const form = h(
    doc,
    'form',
    {},
    field(ctx, t('form.label'), input('label')),
    field(
      ctx,
      t('form.kind'),
      h(
        doc,
        'select',
        { name: 'kind' },
        h(doc, 'option', { value: 'journey' }, t('kind.journey')),
        h(doc, 'option', { value: 'volume' }, t('kind.volume')),
      ),
    ),
    field(ctx, t('form.targetUrl'), input('targetUrl', 'http://fake-orqea:4100', 'url')),
    field(ctx, t('form.allowRemote'), input('allowRemote', '', 'checkbox')),
    field(ctx, t('form.confirmHost'), input('confirmHost')),
    h(
      doc,
      'fieldset',
      {},
      h(doc, 'legend', {}, t('form.personas')),
      ...meta.personas.map((p) =>
        h(
          doc,
          'label',
          {},
          h(doc, 'input', { type: 'checkbox', name: 'persona', value: p.id, checked: true }),
          `${p.displayName} (${Math.round(p.weight * 100)} %)`,
        ),
      ),
    ),
    field(ctx, t('form.seed'), input('seed', '', 'number')),
    field(ctx, t('form.days'), input('days', '7', 'number')),
    field(ctx, t('form.minutesPerRound'), input('minutesPerRound', '60', 'number')),
    field(ctx, t('form.targetUsers'), input('targetUsers', '100', 'number')),
    field(
      ctx,
      t('form.scenario'),
      h(
        doc,
        'select',
        { name: 'scenario' },
        h(doc, 'option', { value: '' }, '—'),
        ...meta.scenarios.map((s) => h(doc, 'option', { value: s }, s)),
      ),
    ),
    field(ctx, t('form.allowCheckout'), input('allowCheckout', '', 'checkbox')),
    field(ctx, t('form.priceScenarios'), h(doc, 'textarea', { name: 'priceScenarios', rows: '3' })),
    alert,
    h(doc, 'button', { type: 'submit' }, t('form.submit')),
  ) as HTMLFormElement;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      const { run } = await ctx.api.post<{ run: { id: string } }>('/api/runs', {
        config: readForm(form),
      });
      ctx.go(`/runs/${run.id}`);
    } catch (e) {
      const detail =
        e instanceof ApiError
          ? ((e.body.issues as string[] | undefined) ?? [e.message]).join('; ')
          : (e as Error).message;
      alert.textContent = t('form.invalid', { detail });
      alert.hidden = false;
    }
  });
  return h(doc, 'section', {}, h(doc, 'h1', {}, t('form.title')), form);
}
