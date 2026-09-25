import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ctxOf, type Ctx, type Deps } from '../context.js';
import { layout } from '../html.js';
import type { User } from '../store.js';

export type Rendered = { title: string; body: string; status?: number };
export type Render = (ctx: Ctx & { user: User }, req: FastifyRequest) => Rendered;
export type PublicRender = (ctx: Ctx, req: FastifyRequest) => Rendered;

export const params = (req: FastifyRequest): Record<string, string> =>
  req.params as Record<string, string>;
export const query = (req: FastifyRequest): Record<string, string | undefined> =>
  req.query as Record<string, string | undefined>;

export function pageRoute(
  app: FastifyInstance,
  deps: Deps,
  path: string,
  render: PublicRender,
  needsUser: boolean,
): void {
  app.get(path, async (req, reply) => {
    const ctx = ctxOf(req, deps);
    if (needsUser && !ctx.user) return reply.redirect('/login');
    const out = render(ctx, req);
    return reply
      .code(out.status ?? 200)
      .type('text/html')
      .send(layout(ctx.view, out.title, out.body));
  });
}

export const appPage = (app: FastifyInstance, deps: Deps, path: string, render: Render): void =>
  pageRoute(app, deps, path, render as PublicRender, true);
export const publicPage = (
  app: FastifyInstance,
  deps: Deps,
  path: string,
  render: PublicRender,
): void => pageRoute(app, deps, path, render, false);
