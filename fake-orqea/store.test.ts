import { describe, expect, it } from 'vitest';
import { checkPassword, hashPassword, Store } from './store.js';

describe('store', () => {
  it('hashes passwords with salt', () => {
    const h = hashPassword('Str0ngPassword1!');
    expect(h).not.toContain('Str0ng');
    expect(checkPassword('Str0ngPassword1!', h)).toBe(true);
    expect(checkPassword('wrong', h)).toBe(false);
    expect(hashPassword('a')).not.toBe(hashPassword('a'));
  });
  it('maps tokens to users', () => {
    const s = new Store();
    expect(s.userByToken(undefined)).toBeUndefined();
    expect(s.userByToken('nope')).toBeUndefined();
    expect(s.id()).toBe(1);
    expect(s.id()).toBe(2);
  });
  it('deletes a user with their boards, lists, cards, forms, notes and codes only', () => {
    const s = new Store();
    const user = (id: number) => ({
      id,
      email: `u${id}@x.io`,
      username: `u${id}`,
      passwordHash: '',
      verified: true,
      verifyToken: '',
      language: 'en',
      theme: 'dark',
      plan: 'free',
      onboardingDismissed: false,
      createdAt: 0,
      runId: null,
    });
    const config = { target_list_id: 3, label_ids: [], fields: [], title_field: 'n' };
    for (const id of [1, 2]) {
      s.users.set(id, user(id));
      s.boards.set(10 + id, {
        id: 10 + id,
        ownerId: id,
        title: 'B',
        invitations: [],
        rules: [],
        labels: [],
        priorities: [],
      });
      s.lists.set(20 + id, { id: 20 + id, boardId: 10 + id, title: 'L', position: 0 });
      s.forms.set(30 + id, {
        id: 30 + id,
        boardId: 10 + id,
        ownerId: id,
        title: 'F',
        token: 't',
        config,
      });
      s.notes.set(40 + id, { id: 40 + id, ownerId: id, content: 'n', remindAt: null });
    }
    s.cards.set(50, {
      id: 50,
      listId: 21,
      title: 'C',
      description: '',
      priorityId: null,
      complexity: null,
      checklist: [],
      comments: [],
    });
    s.issueToken(s.users.get(1)!);
    s.deleteUsers((u) => u.id === 1);
    expect(s.rowCounts()).toEqual({
      users: 1,
      boards: 1,
      lists: 1,
      cards: 0,
      forms: 1,
      notes: 1,
      qrCodes: 0,
    });
    expect(s.tokens.size).toBe(0);
  });
});
