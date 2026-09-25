import type { FastifyInstance } from 'fastify';
import type { Deps } from '../context.js';
import { apiForm, button, esc, field, select } from '../html.js';
import { appPage, params, type Rendered } from './route.js';

export function boardPages(app: FastifyInstance, deps: Deps): void {
  const { store } = deps;
  const notFound = (t: (k: 'notFound') => string): Rendered => ({ title: t('notFound'), body: `<h1>${esc(t('notFound'))}</h1>`, status: 404 });

  appPage(app, deps, '/boards', (ctx) => {
    const { t } = ctx.view;
    const boards = store.boardsOf(ctx.user.id).map((b) => `<li><a href="/boards/${b.id}">${esc(b.name)}</a></li>`).join('');
    const create = apiForm('POST /api/boards', `${field(t('boardName'), 'name', { required: true })}${button(ctx.view, 'createBoard')}`, { redirect: '/boards/{id}' });
    return { title: t('yourBoards'), body: `<h1>${esc(t('yourBoards'))}</h1><ul>${boards}</ul>${create}` };
  });

  appPage(app, deps, '/boards/:boardId', (ctx, req) => {
    const { t } = ctx.view;
    const board = store.boards.get(params(req).boardId as string);
    if (!board || board.ownerId !== ctx.user.id) return notFound(t);
    const lists = store.listsOf(board.id).map((l, i) => {
      const cards = store
        .cardsOf(l.id)
        .map((c) => `<li><input type="checkbox" name="cardIds" value="${c.id}" data-collect data-bulk hidden aria-label="${esc(`${t('select')} ${c.title}`)}" form="bulk"> <a href="/cards/${c.id}" draggable="true" data-card-id="${c.id}">${esc(c.title)}</a></li>`)
        .join('');
      const add = i === 0
        ? apiForm(`POST /api/lists/${l.id}/cards`, `${field(t('cardTitle'), 'title', { required: true })}${button(ctx.view, 'addCard', { icon: true })}`, { done: 'card' })
        : '';
      return `<section data-list-id="${l.id}" aria-label="${esc(l.name)}"><h2>${esc(l.name)}</h2><ul>${cards}</ul>${add}</section>`;
    });
    const addList = apiForm(`POST /api/boards/${board.id}/lists`, `${field(t('listName'), 'name', { required: true })}${button(ctx.view, 'addList')}`, { done: 'list' });
    const bulk = `<button type="button" data-action="select-mode">${esc(t('selectCards'))}</button>
${apiForm('POST /api/cards/bulk', `<input type="hidden" name="action" value="priority"><input type="hidden" name="value" value="high">${button(ctx.view, 'bulkHigh', { attrs: 'data-bulk hidden' })}`, { done: 'bulk' }).replace('<form ', '<form id="bulk" ')}`;
    const nav = `<a href="/boards/${board.id}/automations">${esc(t('automations'))}</a> <a href="/boards/${board.id}/members">${esc(t('members'))}</a>`;
    return { title: board.name, body: `<h1>${esc(board.name)}</h1>${nav}${bulk}<div>${lists.join('')}</div>${addList}` };
  });

  appPage(app, deps, '/cards/:cardId', (ctx, req) => {
    const { t } = ctx.view;
    const card = store.cards.get(params(req).cardId as string);
    if (!card || store.boardOfCard(card).ownerId !== ctx.user.id) return notFound(t);
    const edit = apiForm(
      `PATCH /api/cards/${card.id}`,
      `${field(t('description'), 'description', { textarea: true, value: card.description })}
${select(t('priority'), 'priority', [['low', t('low')], ['medium', t('medium')], ['high', t('high')]], card.priority)}${button(ctx.view, 'save')}`,
      { done: 'saved' },
    );
    const items = card.checklist.map((c) => `<li><label><input type="checkbox"> ${esc(c.text)}</label></li>`).join('');
    const addItem = apiForm(`POST /api/cards/${card.id}/checklist`, `${field(t('newItem'), 'text', { required: true })}${button(ctx.view, 'addItem')}`, { done: 'item' });
    const comments = card.comments.map((c) => `<li>${esc(c.text)}</li>`).join('');
    const addComment = apiForm(`POST /api/cards/${card.id}/comments`, `${field(t('comment'), 'text', { textarea: true, required: true })}${button(ctx.view, 'postComment')}`, { done: 'comment' });
    const board = store.boardOfCard(card);
    return {
      title: card.title,
      body: `<a href="/boards/${board.id}">${esc(board.name)}</a><h1>${esc(card.title)}</h1>${edit}
<h2>${esc(t('checklist'))}</h2><ul>${items}</ul>${addItem}<h2>${esc(t('comments'))}</h2><ul>${comments}</ul>${addComment}`,
    };
  });

  appPage(app, deps, '/boards/:boardId/automations', (ctx, req) => {
    const { t } = ctx.view;
    const board = store.boards.get(params(req).boardId as string);
    if (!board || board.ownerId !== ctx.user.id) return notFound(t);
    const rules = board.rules.map((r) => `<li>${esc(r.name)}</li>`).join('');
    const inner = `${field(t('ruleName'), 'name', { required: true })}
${select(t('when'), 'trigger', [['card-moved-done', t('whenMoved')]], 'card-moved-done')}
${select(t('then'), 'action', [['archive', t('thenArchive')]], 'archive')}${button(ctx.view, 'createRule')}`;
    return { title: t('automations'), body: `<h1>${esc(t('automations'))}</h1><ul>${rules}</ul>${apiForm(`POST /api/boards/${board.id}/automations`, inner, { done: 'rule' })}` };
  });

  appPage(app, deps, '/boards/:boardId/members', (ctx, req) => {
    const { t } = ctx.view;
    const board = store.boards.get(params(req).boardId as string);
    if (!board || board.ownerId !== ctx.user.id) return notFound(t);
    const members = board.members.map((m) => `<li>${esc(m)}</li>`).join('');
    const invite = apiForm(`POST /api/boards/${board.id}/members`, `${field(t('inviteEmail'), 'email', { required: true })}${button(ctx.view, 'sendInvite')}`, { done: 'invite' });
    const guest = apiForm(`POST /api/boards/${board.id}/guest-links`, button(ctx.view, 'guestLink'), { done: 'guest' });
    return { title: t('members'), body: `<h1>${esc(t('members'))}</h1><ul>${members}</ul>${invite}${guest}` };
  });
}
