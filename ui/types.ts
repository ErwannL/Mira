export interface PublicRun {
  id: string;
  kind: 'journey' | 'volume';
  status: string;
  label: string;
  seed: number;
  targetUrl: string;
  /** Named Orqea target (FIGURA_TARGETS), when the run used one. */
  config?: { target?: string | null };
  refusalCode: string | null;
  refusalMessage: string | null;
  error: string | null;
  createdAt: string;
  catalogueVersion: string | null;
  weightsVersion: string | null;
  targetVersion: string | null;
}

export interface Meta {
  personas: {
    id: string;
    displayName: string;
    locale: string;
    device: string;
    goal: string;
    weight: number;
  }[];
  catalogue: {
    version: string;
    useCases: { id: string; title: { en: string; fr: string }; planGate: string }[];
  };
  weightsVersion: string;
  scenarios: string[];
}

export interface UiEvent {
  kind: string;
  personaId: string;
  simTime: string;
  useCaseId: string | null;
  attempt: number;
  friction: { score: number; reasons: { code: string; value: number }[] } | null;
  frustration: number;
  action: string | null;
  rule: string;
  facts: Record<string, number | boolean> | null;
  screenshot: string | null;
}

/** GET /api/me: the operator and the Orqea the admin console was inspecting at sign-in. */
export interface Me {
  operator: string;
  target: string | null;
  targetConfigured: boolean | null;
  targets: { name: string; api: string; web: string | null }[];
}
