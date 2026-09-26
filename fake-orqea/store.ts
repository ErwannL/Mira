import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Entities mirror the real Orqea's rows closely enough for the API shapes; ids are integers. */
export interface User {
  id: number;
  email: string;
  username: string;
  passwordHash: string;
  verified: boolean;
  verifyToken: string;
  language: string;
  theme: string;
  plan: string;
  onboardingDismissed: boolean;
  createdAt: number;
  runId: string | null;
}
export interface Rule {
  id: number;
  name: string;
  trigger: { type: string };
  actions: { type: string }[];
}
export interface Board {
  id: number;
  ownerId: number;
  title: string;
  invitations: string[];
  rules: Rule[];
  labels: { id: number; title: string }[];
  priorities: { id: number; title: string }[];
}
export interface List {
  id: number;
  boardId: number;
  title: string;
  position: number;
}
export interface Card {
  id: number;
  listId: number;
  title: string;
  description: string;
  priorityId: number | null;
  complexity: string | null;
  checklist: { id: number; title: string; done: boolean }[];
  comments: { id: number; authorId: number; content: string }[];
}
export interface FormField {
  id: string;
  type: string;
  label: string;
  required: boolean;
}
export interface Form {
  id: number;
  boardId: number;
  ownerId: number;
  title: string;
  token: string;
  config: { target_list_id: number; label_ids: number[]; fields: FormField[]; title_field: string };
}
export interface Note {
  id: number;
  ownerId: number;
  content: string;
  remindAt: string | null;
}
export interface Qr {
  id: number;
  ownerId: number;
  label: string;
  targetUrl: string;
}

export class Store {
  users = new Map<number, User>();
  tokens = new Map<string, number>();
  boards = new Map<number, Board>();
  lists = new Map<number, List>();
  cards = new Map<number, Card>();
  forms = new Map<number, Form>();
  notes = new Map<number, Note>();
  qrs = new Map<number, Qr>();
  private seq = 0;

  id(): number {
    this.seq += 1;
    return this.seq;
  }

  userByEmail(email: string): User | undefined {
    return [...this.users.values()].find((u) => u.email === email);
  }

  userByToken(token: string | undefined): User | undefined {
    const id = token ? this.tokens.get(token) : undefined;
    return id === undefined ? undefined : this.users.get(id);
  }

  issueToken(user: User): string {
    const token = randomBytes(24).toString('hex');
    this.tokens.set(token, user.id);
    return token;
  }

  boardsOf(userId: number): Board[] {
    return [...this.boards.values()].filter((b) => b.ownerId === userId);
  }

  listsOf(boardId: number): List[] {
    return [...this.lists.values()]
      .filter((l) => l.boardId === boardId)
      .sort((a, b) => a.position - b.position);
  }

  cardsOf(listId: number): Card[] {
    return [...this.cards.values()].filter((c) => c.listId === listId);
  }

  boardOfCard(card: Card): Board {
    const list = this.lists.get(card.listId) as List;
    return this.boards.get(list.boardId) as Board;
  }

  /** Row counts per table, like Orqea's cleanup report. */
  rowCounts(): Record<string, number> {
    return {
      users: this.users.size,
      boards: this.boards.size,
      lists: this.lists.size,
      cards: this.cards.size,
      forms: this.forms.size,
      notes: this.notes.size,
      qrCodes: this.qrs.size,
    };
  }

  deleteUsers(match: (u: User) => boolean): void {
    for (const u of [...this.users.values()].filter(match)) {
      for (const b of this.boardsOf(u.id)) {
        for (const l of this.listsOf(b.id)) {
          for (const c of this.cardsOf(l.id)) this.cards.delete(c.id);
          this.lists.delete(l.id);
        }
        for (const [k, f] of this.forms) if (f.boardId === b.id) this.forms.delete(k);
        this.boards.delete(b.id);
      }
      for (const map of [this.notes, this.qrs] as Map<number, { ownerId: number }>[]) {
        for (const [k, v] of map) if (v.ownerId === u.id) map.delete(k);
      }
      for (const [t, id] of this.tokens) if (id === u.id) this.tokens.delete(t);
      this.users.delete(u.id);
    }
  }
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

export function checkPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':') as [string, string];
  return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(password, salt, 32));
}
