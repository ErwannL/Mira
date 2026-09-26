import type { FastifyInstance } from 'fastify';
import type { Ctx, Deps } from '../context.js';
import type { Board, Card, List, Store } from '../store.js';
import {
  apiForm,
  button,
  esc,
  field,
  hiddenUnless,
  jsonInput,
  toggle,
  type View,
} from '../html.js';
import { appPage, params, type Rendered } from './route.js';

const notFound = (t: View['t']): Rendered => ({
  title: t('notFound'),
  body: `<h1>${esc(t('notFound'))}</h1>`,
  status: 404,
});

/** A card on the board. Orqea's labels are hard-coded French whatever the language (a known fact). */
function cardItem(c: Card): string {
  return `<li><input type="checkbox" data-select data-bulk hidden aria-label="${esc(`Sélectionner la tâche ${c.title}`)}"> <button type="button" draggable="true" data-card-id="${c.id}" data-action="go" data-href="/card/${c.id}" aria-label="${esc(`Ouvrir la tâche ${c.title}`)}">${esc(c.title)}</button></li>`;
}

function listColumn(store: Store, v: View, board: Board, l: List): string {
  const { t } = v;
  const add = apiForm(
    'POST /api/cards',
    `<h3>${esc(t('newCard'))}</h3><input name="title" type="text" placeholder="${esc(t('titlePlaceholder'))}"><input type="hidden" name="list_id" value="${l.id}">${button(v, 'add', { icon: true })}`,
    { redirect: `/board/${board.id}`, id: `add-card-${l.id}`, hidden: true },
  );
  const cards = store.cardsOf(l.id).map(cardItem).join('');
  return `<section data-list-id="${l.id}" aria-label="${esc(l.title)}"><h2>${esc(l.title)}</h2><ul>${cards}</ul>${toggle(t('addCard'), `add-card-${l.id}`)}${add}</section>`;
}

function panels(v: View, board: Board, lists: List[], store: Store): string {
  const { t } = v;
  const rules = board.rules.map((r) => `<li>${esc(r.name)}</li>`).join('');
  const ruleForm = apiForm(
    `POST /api/boards/${board.id}/rules`,
    `${field(t('ruleName'), 'name', { required: true })}${jsonInput('trigger', { type: 'card_created' })}${jsonInput('actions', [{ type: 'complexity.set', complexity: 'light' }])}${button(v, 'save')}`,
    { redirect: `/board/${board.id}?open=rules-panel`, id: 'rule-form', hidden: true },
  );
  const invite = apiForm(
    `POST /api/boards/${board.id}/members`,
    `<input name="email" type="email" aria-label="${esc(t('inviteAria'))}">${button(v, 'invite')}`,
    { redirect: `/board/${board.id}`, done: 'invite' },
  );
  const forms = [...store.forms.values()]
    .filter((f) => f.boardId === board.id)
    .map((f) => `<li>${esc(f.title)} <button type="button">${esc(t('copyLink'))}</button></li>`)
    .join('');
  const config = {
    target_list_id: lists[0]?.id,
    label_ids: board.labels.map((l) => l.id),
    fields: [{ id: 'name', type: 'text', label: 'Your name?', required: true }],
    title_field: 'name',
  };
  const formForm = apiForm(
    `POST /api/boards/${board.id}/forms`,
    `${field(t('titlePlaceholder'), 'title', { required: true })}${jsonInput('config', config)}${button(v, 'save')}`,
    { redirect: `/board/${board.id}?open=forms-panel`, id: 'form-form', hidden: true },
  );
  return `<div id="rules-panel"${hiddenUnless(v, 'rules-panel')}><ul>${rules}</ul>${toggle(t('newRule'), 'rule-form')}${ruleForm}</div>
<div id="members-panel"${hiddenUnless(v, 'members-panel')}>${invite}</div>
<div id="forms-panel"${hiddenUnless(v, 'forms-panel')}><ul>${forms}</ul>${toggle(t('createForm'), 'form-form')}${formForm}</div>`;
}

function boardPage(store: Store, ctx: Ctx, board: Board): Rendered {
  const v = ctx.view;
  const { t } = v;
  const lists = store.listsOf(board.id);
  const count = `<p data-selected-count data-one="${esc(t('selectedOne'))}" data-other="${esc(t('selectedOther'))}" hidden></p>`;
  const toolbar = `<button type="button" data-action="select-mode">${esc(t('select'))}</button>${count}
${toggle(t('rules'), 'rules-panel')} ${toggle(t('collaborators'), 'members-panel')} ${toggle(t('forms'), 'forms-panel')}`;
  const addList = apiForm(
    'POST /api/lists',
    `<input name="title" type="text" aria-label="${esc(t('listName'))}" placeholder="${esc(t('listName'))}"><input type="hidden" name="board_id" value="${board.id}"><button type="submit" aria-label="${esc(t('addNewList'))}">${esc(t('add'))}</button>`,
    { redirect: `/board/${board.id}`, id: 'add-list', hidden: true },
  );
  return {
    title: board.title,
    body: `<h1>${esc(board.title)}</h1>${toolbar}${panels(v, board, lists, store)}
<div>${lists.map((l) => listColumn(store, v, board, l)).join('')}</div>${toggle(t('addList'), 'add-list')}${addList}`,
  };
}

/**
 * The card view. Description and comments are rich-text editors in Orqea whose accessible name
 * sits on a wrapper, not on the editable element: reproduced here (docs/ORQEA_UI_FACTS.md).
 */
function cardPage(store: Store, v: View, card: Card): Rendered {
  const { t } = v;
  const board = store.boardOfCard(card);
  const priorities = board.priorities
    .map((p) => `<option value="${p.id}">${esc(p.title)}</option>`)
    .join('');
  const edit = apiForm(
    `PUT /api/cards/${card.id}`,
    `<div aria-label="${esc(t('description'))}"><div contenteditable="true">${esc(card.description)}</div></div>
<label>${esc(t('priority'))} <select name="priority_id"><option value="">—</option>${priorities}</select></label>${button(v, 'saveTask')}`,
    { redirect: `/board/${board.id}` },
  );
  const items = card.checklist
    .map((c) => `<li><label><input type="checkbox"> ${esc(c.title)}</label></li>`)
    .join('');
  const addItem = apiForm(
    `POST /api/cards/${card.id}/checklist/items`,
    `<input name="title" type="text" aria-label="${esc(t('addItem'))}"><button type="submit" aria-label="${esc(t('addCheck'))}">➕</button>`,
    { redirect: `/card/${card.id}` },
  );
  const comments = card.comments.map((c) => `<li>${esc(c.content)}</li>`).join('');
  const activity = `<div role="tablist"><button type="button" role="tab" data-action="toggle" data-target="activity">${esc(t('activity'))}</button></div>
<div id="activity"${hiddenUnless(v, 'activity')}><ul>${comments}</ul><div aria-label="${esc(t('addComment'))}"><div contenteditable="true"></div></div>
<button type="button" aria-label="${esc(t('addComment'))}" disabled>${esc(t('add'))}</button></div>`;
  return {
    title: card.title,
    body: `<button type="button" data-action="go" data-href="/board/${board.id}">${esc(board.title)}</button><h1>${esc(card.title)}</h1>${edit}
<h2>Checklist</h2><ul>${items}</ul>${addItem}${activity}`,
  };
}

export function boardPages(app: FastifyInstance, deps: Deps): void {
  const { store } = deps;
  appPage(app, deps, '/board/:id', (ctx, req) => {
    const board = store.boards.get(Number(params(req).id));
    if (!board || board.ownerId !== ctx.user.id) return notFound(ctx.view.t);
    return boardPage(store, ctx, board);
  });
  appPage(app, deps, '/card/:id', (ctx, req) => {
    const card = store.cards.get(Number(params(req).id));
    if (!card || store.boardOfCard(card).ownerId !== ctx.user.id) return notFound(ctx.view.t);
    return cardPage(store, ctx.view, card);
  });
}
