import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export interface User {
  id: string;
  email: string;
  username: string | null;
  passwordHash: string;
  verified: boolean;
  verifyToken: string;
  language: string;
  theme: string;
  plan: string;
  onboarded: boolean;
  createdAt: number;
  runId: string | null;
}
export interface Board {
  id: string;
  ownerId: string;
  name: string;
  members: string[];
  guestLinks: string[];
  rules: { name: string; trigger: string; action: string }[];
}
export interface List {
  id: string;
  boardId: string;
  name: string;
  position: number;
}
export interface Card {
  id: string;
  listId: string;
  title: string;
  description: string;
  priority: string;
  checklist: { text: string }[];
  comments: { authorId: string; text: string; mentions: string[] }[];
}
export interface Form {
  id: string;
  ownerId: string;
  title: string;
  questions: string[];
  answers: string[][];
}
export interface Note {
  id: string;
  ownerId: string;
  text: string;
  remindAt: string;
}
export interface Qr {
  id: string;
  ownerId: string;
  url: string;
}

export class Store {
  users = new Map<string, User>();
  tokens = new Map<string, string>();
  boards = new Map<string, Board>();
  lists = new Map<string, List>();
  cards = new Map<string, Card>();
  forms = new Map<string, Form>();
  notes = new Map<string, Note>();
  qrs = new Map<string, Qr>();
  private seq = 0;

  id(prefix: string): string {
    this.seq += 1;
    return `${prefix}${this.seq.toString(36)}`;
  }

  userByEmail(email: string): User | undefined {
    return [...this.users.values()].find((u) => u.email === email);
  }

  userByToken(token: string | undefined): User | undefined {
    const id = token ? this.tokens.get(token) : undefined;
    return id ? this.users.get(id) : undefined;
  }

  issueToken(user: User): string {
    const token = randomBytes(24).toString('hex');
    this.tokens.set(token, user.id);
    return token;
  }

  boardsOf(userId: string): Board[] {
    return [...this.boards.values()].filter((b) => b.ownerId === userId);
  }

  listsOf(boardId: string): List[] {
    return [...this.lists.values()]
      .filter((l) => l.boardId === boardId)
      .sort((a, b) => a.position - b.position);
  }

  cardsOf(listId: string): Card[] {
    return [...this.cards.values()].filter((c) => c.listId === listId);
  }

  boardOfCard(card: Card): Board {
    const list = this.lists.get(card.listId) as List;
    return this.boards.get(list.boardId) as Board;
  }

  /** Number of stored rows (all entity kinds) — used by the cleanup report. */
  rowCount(): number {
    return (
      this.users.size +
      this.boards.size +
      this.lists.size +
      this.cards.size +
      this.forms.size +
      this.notes.size +
      this.qrs.size
    );
  }

  deleteUsers(match: (u: User) => boolean): void {
    for (const u of [...this.users.values()].filter(match)) {
      for (const b of this.boardsOf(u.id)) {
        for (const l of this.listsOf(b.id)) {
          for (const c of this.cardsOf(l.id)) this.cards.delete(c.id);
          this.lists.delete(l.id);
        }
        this.boards.delete(b.id);
      }
      for (const map of [this.forms, this.notes, this.qrs] as Map<string, { ownerId: string }>[]) {
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
