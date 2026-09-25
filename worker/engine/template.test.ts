import { describe, expect, it } from 'vitest';
import { buildBody, fillTemplate, readPath } from './template.js';

describe('template', () => {
  it('fills known variables and keeps unknown ones visible', () => {
    expect(fillTemplate('/b/{{id}}/{{nope}}', { id: '7' })).toBe('/b/7/{{nope}}');
  });
  it('builds nested bodies', () => {
    expect(buildBody({ a: ['{{x}}', 1, true, null], b: { c: '{{x}}' } }, { x: 'v' })).toEqual({
      a: ['v', 1, true, null],
      b: { c: 'v' },
    });
    expect(buildBody(undefined, {})).toBeUndefined();
  });
  it('reads dotted paths', () => {
    expect(readPath({ lists: [{ id: 'l1' }] }, 'lists.0.id')).toBe('l1');
    expect(readPath({ a: 1 }, 'a.b')).toBeUndefined();
    expect(readPath(null, 'a')).toBeUndefined();
  });
});
