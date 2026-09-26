import type { FastifyReply, FastifyRequest } from 'fastify';
import { ctxOf, type Ctx, type Deps } from '../context.js';
import type { Board, Card, List, User } from '../store.js';

export type Body = Record<string, unknown>;
export const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
/** Orqea takes ids as numbers or numeric strings (a JSON template only produces strings). */
export const num = (v: unknown): number => (typeof v === 'number' ? v : Number(str(v) || NaN));

export interface Authed {
  ctx: Ctx;
  user: User;
  body: Body;
}

export function helpers(deps: Deps) {
  const { store } = deps;
  const authed = (req: FastifyRequest, reply: FastifyReply): Authed | null => {
    const ctx = ctxOf(req, deps);
    if (!ctx.user) {
      void reply.code(401).send({ message: 'No token provided' });
      return null;
    }
    return { ctx, user: ctx.user, body: (req.body ?? {}) as Body };
  };
  const ownBoard = (user: User, id: unknown): Board | undefined => {
    const b = store.boards.get(num(id));
    return b && b.ownerId === user.id ? b : undefined;
  };
  const ownList = (user: User, id: unknown): List | undefined => {
    const l = store.lists.get(num(id));
    return l && ownBoard(user, l.boardId) ? l : undefined;
  };
  const ownCard = (user: User, id: unknown): Card | undefined => {
    const c = store.cards.get(num(id));
    return c && store.boardOfCard(c).ownerId === user.id ? c : undefined;
  };
  /** Orqea answers 404 (never 403) for what the user cannot see. */
  const notFound = (reply: FastifyReply, what = 'Not found') =>
    reply.code(404).send({ message: what });
  const bad = (reply: FastifyReply, message: string) => reply.code(400).send({ message });
  const param = (req: FastifyRequest, name: string) =>
    (req.params as Record<string, string>)[name] as string;
  return { store, authed, ownBoard, ownList, ownCard, notFound, bad, param };
}
export type Helpers = ReturnType<typeof helpers>;

export const cardJson = (c: Card) => ({
  id: c.id,
  list_id: c.listId,
  title: c.title,
  description: c.description,
  priority_id: c.priorityId,
  complexity: c.complexity,
});
export const listJson = (l: List) => ({
  id: l.id,
  board_id: l.boardId,
  title: l.title,
  position: l.position,
});
export const boardJson = (b: Board) => ({ id: b.id, title: b.title, owner_id: b.ownerId });
