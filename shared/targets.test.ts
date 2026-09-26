import { describe, expect, it } from 'vitest';
import {
  applyTarget,
  browserBaseUrl,
  effectiveTarget,
  parseTargets,
  publicTargets,
  TARGET_NOT_CONFIGURED,
} from './targets.js';

/** The default an embedding compose uses (docs/ORQEA_INTEGRATION.md). */
const ORQEA_LOCAL = JSON.stringify({
  local: {
    api: 'http://backend:5001',
    web: 'http://frontend:3001',
    rewrite: {
      'http://localhost:5001': 'http://backend:5001',
      'http://localhost:3001/': 'http://frontend:3001',
    },
  },
  recette: { api: 'http://host.docker.internal:5102' },
});

describe('FIGURA_TARGETS', () => {
  it('parses named targets; unset or blank means none', () => {
    const t = parseTargets(ORQEA_LOCAL);
    expect(t.local!.rewrite).toEqual({
      'http://localhost:5001': 'http://backend:5001',
      'http://localhost:3001': 'http://frontend:3001',
    });
    expect(t.recette).toEqual({ api: 'http://host.docker.internal:5102', rewrite: {} });
    expect(parseTargets(undefined)).toEqual({});
    expect(parseTargets('  ')).toEqual({});
  });

  it('refuses bad JSON, bad names, bad URLs and rewrites that are not origins', () => {
    expect(() => parseTargets('{')).toThrow('FIGURA_TARGETS must be valid JSON');
    expect(() => parseTargets('{"Local!":{"api":"http://a"}}')).toThrow('FIGURA_TARGETS: Local!');
    expect(() => parseTargets('{"x":{"api":"nope"}}')).toThrow('FIGURA_TARGETS: x.api');
    expect(() =>
      parseTargets('{"x":{"api":"http://a","rewrite":{"http://a/p":"http://b"}}}'),
    ).toThrow('FIGURA_TARGETS: x.rewrite.http://a/p');
    expect(() =>
      parseTargets('{"x":{"api":"http://a","rewrite":{"http://a":"http://b/p"}}}'),
    ).toThrow('must be an origin');
    expect(() => parseTargets('{"x":{"api":"http://a","extra":1}}')).toThrow('FIGURA_TARGETS: x');
  });

  it('the browser opens the public origin that is rewritten to the web app', () => {
    const t = parseTargets(ORQEA_LOCAL);
    expect(browserBaseUrl({ web: t.local!.web!, rewrite: t.local!.rewrite })).toBe(
      'http://localhost:3001',
    );
    expect(browserBaseUrl({ web: 'http://orqea.test/app/', rewrite: {} })).toBe(
      'http://orqea.test/app',
    );
    expect(
      browserBaseUrl({
        web: 'http://frontend:3001/app',
        rewrite: { 'http://pub': 'http://frontend:3001' },
      }),
    ).toBe('http://pub/app');
  });

  it('lists targets for the UI without anything else', () => {
    expect(publicTargets(parseTargets(ORQEA_LOCAL))).toEqual([
      { name: 'local', api: 'http://backend:5001', web: 'http://frontend:3001' },
      { name: 'recette', api: 'http://host.docker.internal:5102', web: null },
    ]);
  });
});

describe('applyTarget (server side of run creation)', () => {
  const targets = parseTargets(ORQEA_LOCAL);
  it('leaves configs without a named target alone', () => {
    for (const raw of [undefined, null, 'x', { kind: 'journey' }, { target: null }])
      expect(applyTarget(raw, targets)).toEqual({ config: raw });
  });
  it('fills URLs from the named target, over anything the client sent', () => {
    expect(
      applyTarget(
        { kind: 'journey', target: 'local', targetUrl: 'http://evil', webUrl: 'x' },
        targets,
      ),
    ).toEqual({
      config: {
        kind: 'journey',
        target: 'local',
        targetUrl: 'http://backend:5001',
        webUrl: 'http://frontend:3001',
      },
    });
    expect(applyTarget({ kind: 'volume', target: 'recette' }, targets)).toEqual({
      config: {
        kind: 'volume',
        target: 'recette',
        targetUrl: 'http://host.docker.internal:5102',
        webUrl: null,
      },
    });
  });
  it('TARGET_NOT_CONFIGURED for an unknown name or a journey without a web URL', () => {
    expect(applyTarget({ kind: 'volume', target: 'prod' }, targets)).toEqual({
      error: TARGET_NOT_CONFIGURED,
      issues: ['target: "prod" is not configured in FIGURA_TARGETS'],
    });
    expect(applyTarget({ kind: 'journey', target: 'recette' }, targets)).toMatchObject({
      error: TARGET_NOT_CONFIGURED,
    });
  });
});

describe('effectiveTarget (worker side)', () => {
  const targets = parseTargets(ORQEA_LOCAL);
  it('a run without a named target uses its own URLs, without rewrites', () => {
    expect(
      effectiveTarget({ target: null, targetUrl: 'http://fake:4100', webUrl: null }, targets),
    ).toEqual({
      api: 'http://fake:4100',
      web: 'http://fake:4100',
      browserBase: 'http://fake:4100',
      rewrite: {},
    });
    expect(
      effectiveTarget({ target: null, targetUrl: 'http://a:1', webUrl: 'http://w:2/' }, targets)!
        .browserBase,
    ).toBe('http://w:2');
  });
  it("a named target uses the worker's configuration; unknown here is null", () => {
    expect(
      effectiveTarget({ target: 'local', targetUrl: 'http://ignored', webUrl: null }, targets),
    ).toEqual({
      api: 'http://backend:5001',
      web: 'http://frontend:3001',
      browserBase: 'http://localhost:3001',
      rewrite: targets.local!.rewrite,
    });
    expect(effectiveTarget({ target: 'recette', targetUrl: 'x', webUrl: null }, targets)!.web).toBe(
      'http://host.docker.internal:5102',
    );
    expect(effectiveTarget({ target: 'qa', targetUrl: 'x', webUrl: null }, targets)).toBeNull();
  });
});
