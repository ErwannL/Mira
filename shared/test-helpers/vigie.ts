/** Vigie's own examples (docs/CONTRACT.md §4). */
export const SCENARIO = {
  schema: 1,
  kind: 'vigie.scenario',
  incidentId: 1,
  sourceEnv: 'prod',
  targetEnv: 'recette',
  persona: { plan: 'free', device: 'mobile', locale: 'en' },
  steps: [
    { action: 'login', target: null },
    { action: 'visit', target: '/boards' },
    { action: 'visit', target: '/board/:boardId', expect: { maxDurationMs: 340, status: 200 } },
  ],
  watch: { routes: ['/api/boards/:boardId'], fingerprints: [] },
  basis: { pathSessions: 331 },
};
export const PERSONA_SET = {
  schema: 1,
  kind: 'vigie.persona_set',
  sourceEnv: 'prod',
  targetEnv: 'recette',
  window: { from: '2026-08-29T12:55:26.406Z', to: '2026-09-26T12:55:26.406Z', days: 28 },
  personas: [
    {
      name: 'free-desktop',
      traits: { plan: 'free', device: 'desktop', locale: 'fr' },
      weights: {
        features: { 'card.create': 0.681, 'card.move': 0.559, 'list.create': 0.282, x: 0, y: null },
        sessionLength: { medianEvents: 10.5, medianMinutes: 3.392 },
        dropOff: {
          activation: { signup_start: 0.516, signup_done: 0, first_board: null },
          upgrade: { upgrade: 0.827 },
        },
      },
      sample: { people: 452, sessions: 2056, window: { from: '…', to: '…', days: 28 } },
    },
    {
      name: 'Pro Mobile',
      traits: { plan: 'pro', device: 'tablet', locale: 'en' },
      sample: { people: 148 },
    },
  ],
};
