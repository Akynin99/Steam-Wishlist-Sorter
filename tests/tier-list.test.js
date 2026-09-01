/**
 * The grouping behind the tier list panel, and what a card moved in it means.
 *
 * Two halves. The first is the grouping the panel draws: that every item of
 * the result lands in one row and only one, that a row keeps the order the
 * ranking gave it, that the scale stays five rows wide even when nothing was
 * put on some of them, and that the two rows which are not part of the scale
 * appear only when they hold something.
 *
 * The second is the moving, which is the reason the panel is not only a view.
 * A card dragged or walked with the keyboard becomes at most two calls on the
 * session, and the order of those two is not free: `moveItem()` refuses an
 * anchor from another category, so the category has to be changed first. All
 * of that is decided without a DOM, which is why all of it is checked here
 * rather than by hand in a browser.
 *
 * The sessions below are built through `ranking.js` rather than hand-written
 * as literals: the shape of a result is that module's business, and a fixture
 * copied out of it would go on passing after the shape changed.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSession } from '../src/ranking.js';
import {
  TIER_NONE,
  TIER_REMOVE,
  TIER_ROW_IDS,
  TIER_SCALE,
  applyTierMove,
  buildTierBoard,
  buildTierList,
  planTierMove,
  planTierStep,
  tierRowCategory,
} from '../src/tier-list.js';

/**
 * @param {number} appId
 * @param {string} title
 * @param {number} [position]
 * @returns {object}
 */
function item(appId, title, position = appId) {
  return {
    appId,
    title,
    url: `https://store.steampowered.com/app/${appId}/`,
    kind: 'game',
    wishlistPosition: position,
  };
}

/**
 * A session with one item in each of the six categories and one left without.
 *
 * @returns {import('../src/ranking.js').RankingSession}
 */
function everyCategory() {
  const ranking = createSession();
  ranking.addItems([
    item(10, 'Must'),
    item(20, 'Want'),
    item(30, 'Maybe'),
    item(40, 'Unlikely'),
    item(50, 'Meh'),
    item(60, 'Remove'),
    item(70, 'Nowhere'),
  ]);
  ranking.setCategory(10, 'must');
  ranking.setCategory(20, 'want');
  ranking.setCategory(30, 'maybe');
  ranking.setCategory(40, 'unlikely');
  ranking.setCategory(50, 'meh');
  ranking.setCategory(60, 'remove');
  return ranking;
}

/**
 * @param {import('../src/tier-list.js').TierRow[]} rows
 * @returns {string[]}
 */
function ids(rows) {
  return rows.map((row) => row.id);
}

/**
 * @param {import('../src/tier-list.js').TierRow[]} rows
 * @param {string} id
 * @returns {import('../src/tier-list.js').TierRow}
 */
function row(rows, id) {
  const found = rows.find((candidate) => candidate.id === id);
  assert.ok(found, `there is no “${id}” row`);
  return found;
}

test('the scale is the five sortable categories, in the order of interest', () => {
  assert.deepEqual([...TIER_SCALE], ['must', 'want', 'maybe', 'unlikely', 'meh']);
});

test('the five rows of the scale are there even when nothing was put on them', () => {
  const ranking = createSession();
  ranking.addItems([item(10, 'Alpha')]);
  ranking.setCategory(10, 'must');

  const rows = buildTierList(ranking.getResult());

  assert.deepEqual(ids(rows), ['must', 'want', 'maybe', 'unlikely', 'meh']);
  assert.deepEqual(row(rows, 'want').items, [], 'an untouched level is an empty row, not a missing one');
});

test('an empty session still gives the scale and nothing else', () => {
  const rows = buildTierList(createSession().getResult());

  assert.deepEqual(ids(rows), ['must', 'want', 'maybe', 'unlikely', 'meh']);
  assert.deepEqual(rows.flatMap((entry) => entry.items), []);
});

test('every item of the result lands in exactly one row', () => {
  const result = everyCategory().getResult();
  const rows = buildTierList(result);

  const placed = rows.flatMap((entry) => entry.items.map((card) => card.appId));
  assert.deepEqual([...placed].sort((a, b) => a - b), [10, 20, 30, 40, 50, 60, 70]);
  assert.equal(new Set(placed).size, placed.length, 'an app id shows up in two rows');
  assert.equal(placed.length, result.entries.length + result.removed.length);
});

test('the order inside a row is the order of the entries and nothing else', () => {
  const ranking = createSession();
  // The fallback order is the wishlist order, so the three arrive 30, 20, 10
  // and stay that way until an answer says otherwise.
  ranking.addItems([item(10, 'Alpha', 3), item(20, 'Beta', 2), item(30, 'Gamma', 1)]);
  for (const appId of [10, 20, 30]) ranking.setCategory(appId, 'want');

  const before = buildTierList(ranking.getResult());
  assert.deepEqual(row(before, 'want').items.map((card) => card.appId), [30, 20, 10]);

  ranking.submitAnswer('a', { a: 10, b: 30 });
  const result = ranking.getResult();
  const after = buildTierList(result);

  assert.deepEqual(
    row(after, 'want').items.map((card) => card.appId),
    result.entries.filter((entry) => entry.category === 'want').map((entry) => entry.appId),
    'the row follows the entries; it does not sort them again',
  );
  assert.deepEqual(row(after, 'want').items.map((card) => card.appId), [20, 10, 30]);
});

test('a card carries the place the result gave it', () => {
  const rows = buildTierList(everyCategory().getResult());

  assert.deepEqual(row(rows, 'must').items[0], {
    appId: 10,
    item: everyCategory().getItem(10),
    position: 1,
  });
});

test('the row without a category appears only when something is in it', () => {
  const ranking = createSession();
  ranking.addItems([item(10, 'Alpha'), item(70, 'Nowhere')]);
  ranking.setCategory(10, 'must');

  assert.ok(ids(buildTierList(ranking.getResult())).includes(TIER_NONE));
  assert.deepEqual(
    row(buildTierList(ranking.getResult()), TIER_NONE).items.map((card) => card.appId),
    [70],
  );

  ranking.setCategory(70, 'meh');
  assert.equal(ids(buildTierList(ranking.getResult())).includes(TIER_NONE), false);
});

test('the row without a category has no category to take a caption from', () => {
  const rows = buildTierList(everyCategory().getResult());
  const none = row(rows, TIER_NONE);

  assert.equal(none.category, null);
  assert.equal(none.onScale, false);
});

test('the removal row appears only when something is in it, and always last', () => {
  const ranking = createSession();
  ranking.addItems([item(10, 'Alpha'), item(60, 'Remove')]);
  ranking.setCategory(10, 'must');

  assert.equal(ids(buildTierList(ranking.getResult())).includes(TIER_REMOVE), false);

  ranking.setCategory(60, 'remove');
  const rows = buildTierList(ranking.getResult());
  assert.equal(rows.at(-1).id, TIER_REMOVE);
});

test('the removal row is built from `removed`, which carries no places', () => {
  const result = everyCategory().getResult();
  const removal = row(buildTierList(result), TIER_REMOVE);

  assert.deepEqual(removal.items.map((card) => card.appId), result.removed.map((entry) => entry.appId));
  assert.deepEqual(removal.items.map((card) => card.position), [null]);
  assert.deepEqual(removal.items.map((card) => card.item), result.removed);
});

test('the rows come in the order of interest, with the two apart from it at the end', () => {
  assert.deepEqual(ids(buildTierList(everyCategory().getResult())), [
    'must',
    'want',
    'maybe',
    'unlikely',
    'meh',
    TIER_NONE,
    TIER_REMOVE,
  ]);
});

test('a sorting stopped halfway groups exactly as a finished one does', () => {
  const ranking = createSession();
  ranking.addItems([
    item(10, 'Alpha', 1),
    item(20, 'Beta', 2),
    item(30, 'Gamma', 3),
    item(40, 'Delta', 4),
  ]);
  for (const appId of [10, 20]) ranking.setCategory(appId, 'must');
  for (const appId of [30, 40]) ranking.setCategory(appId, 'maybe');
  ranking.submitAnswer('b', { a: 10, b: 20 });

  const result = ranking.getResult();
  assert.equal(result.summary.complete, false, 'this sorting is meant to be unfinished');
  assert.ok(result.summary.fallback > 0, 'part of it is meant to stand in the fallback order');

  const rows = buildTierList(result);
  assert.deepEqual(row(rows, 'must').items.map((card) => card.appId), [20, 10]);
  assert.deepEqual(row(rows, 'maybe').items.map((card) => card.appId), [30, 40]);
  assert.deepEqual(
    rows.flatMap((entry) => entry.items.map((card) => card.position)),
    [1, 2, 3, 4],
    'the places are the ones the result gave, in the order the rows hold them',
  );
});

test('a hand placement moves the card, because it moved the entry', () => {
  const ranking = createSession();
  ranking.addItems([item(10, 'Alpha', 1), item(20, 'Beta', 2), item(30, 'Gamma', 3)]);
  for (const appId of [10, 20, 30]) ranking.setCategory(appId, 'want');

  assert.deepEqual(
    row(buildTierList(ranking.getResult()), 'want').items.map((card) => card.appId),
    [10, 20, 30],
  );

  ranking.moveItem(30, 10, 'before');
  assert.deepEqual(
    row(buildTierList(ranking.getResult()), 'want').items.map((card) => card.appId),
    [30, 10, 20],
  );
});

test('nothing at all is still five rows rather than a crash', () => {
  assert.deepEqual(ids(buildTierList(undefined)), ['must', 'want', 'maybe', 'unlikely', 'meh']);
  assert.deepEqual(ids(buildTierList({})), ['must', 'want', 'maybe', 'unlikely', 'meh']);
});

/* ------------------------------------------------------------ the board */

/**
 * A session of six games, three in `must` and three in `want`, in a known
 * order and with no answers behind it: the fallback order is the wishlist
 * order, so what the rows hold at the start is written out and not guessed.
 *
 * @returns {import('../src/ranking.js').RankingSession}
 */
function twoRows() {
  const ranking = createSession();
  ranking.addItems([
    item(10, 'Alpha', 1),
    item(20, 'Beta', 2),
    item(30, 'Gamma', 3),
    item(40, 'Delta', 4),
    item(50, 'Epsilon', 5),
    item(60, 'Zeta', 6),
  ]);
  for (const appId of [10, 20, 30]) ranking.setCategory(appId, 'must');
  for (const appId of [40, 50, 60]) ranking.setCategory(appId, 'want');
  return ranking;
}

/**
 * The board as `appId`s, row by row, which is what nearly every test below
 * compares against.
 *
 * @param {import('../src/ranking.js').RankingSession} ranking
 * @returns {Record<string, number[]>}
 */
function layout(ranking) {
  const board = {};
  for (const tier of buildTierBoard(ranking.getResult())) {
    board[tier.id] = tier.items.map((card) => card.appId);
  }
  return board;
}

/**
 * Plans a drop against the current board and carries it out, the way the panel
 * does it on a drop and on a key.
 *
 * @param {import('../src/ranking.js').RankingSession} ranking
 * @param {import('../src/tier-list.js').TierDrop} drop
 * @returns {boolean} Whether anything was done.
 */
function drop(ranking, drop_) {
  return applyTierMove(ranking, planTierMove(buildTierBoard(ranking.getResult()), drop_));
}

test('the board is all seven rows, in the order they are drawn', () => {
  assert.deepEqual(
    [...TIER_ROW_IDS],
    ['must', 'want', 'maybe', 'unlikely', 'meh', TIER_NONE, TIER_REMOVE],
  );
  assert.deepEqual(ids(buildTierBoard(createSession().getResult())), [...TIER_ROW_IDS]);
});

test('the board keeps the two rows off the scale even when they are empty', () => {
  // Which is the whole reason it exists: with every game classified there is
  // no «not categorized» row to be seen, and a row that is not on the screen
  // is a row nothing can be dropped into.
  const rows = buildTierBoard(twoRows().getResult());

  assert.deepEqual(row(rows, TIER_NONE).items, []);
  assert.deepEqual(row(rows, TIER_REMOVE).items, []);
  assert.equal(row(rows, TIER_NONE).onScale, false);
  assert.equal(row(rows, TIER_NONE).category, null, 'the empty row has no category either');
  assert.equal(rows.at(-1).id, TIER_REMOVE, 'the removal row stays last');
});

test('the board holds what the grouping holds, row for row', () => {
  const result = everyCategory().getResult();
  const board = buildTierBoard(result);

  for (const tier of buildTierList(result)) {
    assert.deepEqual(row(board, tier.id), tier);
  }
});

test('a row stands for its category, and the row without one stands for null', () => {
  for (const id of TIER_SCALE) assert.equal(tierRowCategory(id), id);
  assert.equal(tierRowCategory(TIER_REMOVE), 'remove');
  assert.equal(tierRowCategory(TIER_NONE), null);
  assert.equal(tierRowCategory('unheard-of'), undefined);
});

/* ------------------------------------------------------- moving a card */

test('a card moved inside its row gives the order it was dropped into', () => {
  const ranking = twoRows();

  assert.ok(drop(ranking, { appId: 10, row: 'must', anchor: 30, side: 'after' }));
  assert.deepEqual(layout(ranking).must, [20, 30, 10]);

  assert.ok(drop(ranking, { appId: 10, row: 'must', anchor: 20, side: 'before' }));
  assert.deepEqual(layout(ranking).must, [10, 20, 30]);
});

test('a card dropped on the row itself goes to the end of it', () => {
  const ranking = twoRows();

  assert.ok(drop(ranking, { appId: 10, row: 'must', anchor: null }));
  assert.deepEqual(layout(ranking).must, [20, 30, 10]);
});

test('a card moved to another row changes category and lands where it was dropped', () => {
  const ranking = twoRows();

  assert.ok(drop(ranking, { appId: 10, row: 'want', anchor: 50, side: 'before' }));

  assert.equal(ranking.getCategory(10), 'want');
  assert.deepEqual(layout(ranking), {
    must: [20, 30],
    want: [40, 10, 50, 60],
    maybe: [],
    unlikely: [],
    meh: [],
    [TIER_NONE]: [],
    [TIER_REMOVE]: [],
  });
});

test('the category is changed before the place, because the other way round throws', () => {
  // This is the rule the whole of `applyTierMove()` exists for. Left in the
  // order a reader would write them in — place first, category second — the
  // very same move is a `cross-category` error every time.
  const ranking = twoRows();
  const move = planTierMove(buildTierBoard(ranking.getResult()), {
    appId: 10,
    row: 'want',
    anchor: 50,
    side: 'before',
  });

  assert.equal(move.categoryChanged, true);
  assert.throws(
    () => ranking.moveItem(move.appId, move.anchor, move.side),
    (error) => error.code === 'cross-category',
  );

  ranking.setCategory(move.appId, move.category);
  assert.doesNotThrow(() => ranking.moveItem(move.appId, move.anchor, move.side));
});

test('a card moved into an empty row is a change of category and nothing else', () => {
  const ranking = twoRows();
  const move = planTierMove(buildTierBoard(ranking.getResult()), { appId: 10, row: 'meh', anchor: null });

  assert.deepEqual(move, {
    appId: 10,
    row: 'meh',
    category: 'meh',
    categoryChanged: true,
    anchor: null,
    side: 'after',
  });

  applyTierMove(ranking, move);
  assert.deepEqual(layout(ranking).meh, [10]);
  assert.equal(ranking.manualMoveCount, 0, 'there was nothing to stand next to, so nothing was recorded');
});

test('a card moved into the row without a category loses the category it had', () => {
  const ranking = twoRows();

  assert.ok(drop(ranking, { appId: 20, row: TIER_NONE, anchor: null }));

  assert.equal(ranking.getCategory(20), null);
  assert.deepEqual(layout(ranking).must, [10, 30]);
  assert.deepEqual(layout(ranking)[TIER_NONE], [20]);
  // Still part of the list: an item without a category is ranked below every
  // named one, it is not set aside.
  assert.equal(
    ranking.getResult().entries.find((entry) => entry.appId === 20).position,
    6,
  );
});

test('two cards without a category are ordered against each other like any others', () => {
  const ranking = twoRows();
  drop(ranking, { appId: 10, row: TIER_NONE, anchor: null });
  drop(ranking, { appId: 20, row: TIER_NONE, anchor: null });

  assert.deepEqual(layout(ranking)[TIER_NONE], [10, 20]);
  assert.ok(drop(ranking, { appId: 20, row: TIER_NONE, anchor: 10, side: 'before' }));
  assert.deepEqual(layout(ranking)[TIER_NONE], [20, 10]);
});

test('a card moved into the removal row is marked and leaves the numbering', () => {
  const ranking = twoRows();

  assert.ok(drop(ranking, { appId: 30, row: TIER_REMOVE, anchor: null }));

  assert.equal(ranking.getCategory(30), 'remove');
  assert.deepEqual(layout(ranking)[TIER_REMOVE], [30]);

  const result = ranking.getResult();
  assert.deepEqual(result.removed.map((entry) => entry.appId), [30]);
  assert.equal(result.entries.some((entry) => entry.appId === 30), false);
  assert.deepEqual(result.entries.map((entry) => entry.position), [1, 2, 3, 4, 5]);
});

test('a card dragged back out of the removal row is ranked again', () => {
  const ranking = twoRows();
  drop(ranking, { appId: 30, row: TIER_REMOVE, anchor: null });

  assert.ok(drop(ranking, { appId: 30, row: 'want', anchor: 40, side: 'before' }));

  assert.equal(ranking.getCategory(30), 'want');
  assert.deepEqual(layout(ranking).want, [30, 40, 50, 60]);
  assert.deepEqual(ranking.getResult().removed, []);
});

test('a card moved inside the removal row is no move at all', () => {
  const ranking = twoRows();
  drop(ranking, { appId: 30, row: TIER_REMOVE, anchor: null });
  drop(ranking, { appId: 60, row: TIER_REMOVE, anchor: null });

  const board = buildTierBoard(ranking.getResult());
  assert.equal(planTierMove(board, { appId: 60, row: TIER_REMOVE, anchor: 30, side: 'before' }), null);
  assert.equal(
    ranking.manualMoveCount,
    0,
    'a row that takes no part in the sorting has no order to record a place in',
  );
});

test('a card dropped where it already stands is not a move', () => {
  const ranking = twoRows();

  const board = buildTierBoard(ranking.getResult());
  assert.equal(planTierMove(board, { appId: 20, row: 'must', anchor: 10, side: 'after' }), null);
  assert.equal(planTierMove(board, { appId: 20, row: 'must', anchor: 30, side: 'before' }), null);
  assert.equal(planTierMove(board, { appId: 20, row: 'must', anchor: 20, side: 'after' }), null);
  assert.equal(applyTierMove(ranking, null), false);
  assert.equal(ranking.manualMoveCount, 0, 'nothing happened, so nothing was written down');
});

test('a drop nobody can carry out is refused rather than guessed at', () => {
  const board = buildTierBoard(twoRows().getResult());

  assert.equal(planTierMove(board, { appId: 10, row: 'nowhere', anchor: null }), null);
  assert.equal(planTierMove(board, { appId: 999, row: 'must', anchor: 10, side: 'after' }), null);
  assert.equal(planTierMove(board, undefined), null);
  assert.equal(planTierMove(undefined, { appId: 10, row: 'must', anchor: null }), null);
});

test('an anchor that is not in the row named by the drop sends the card to its end', () => {
  const ranking = twoRows();

  // The panel names the row it drew and the card inside it; a pair that does
  // not go together is a drop the panel cannot mean, and the row wins, because
  // the row is the thing that was aimed at.
  assert.ok(drop(ranking, { appId: 10, row: 'want', anchor: 30, side: 'before' }));
  assert.deepEqual(layout(ranking).want, [40, 50, 60, 10]);
});

/* --------------------------------------------------- moving with keys */

test('a step sideways swaps the card with its neighbour in the row', () => {
  const ranking = twoRows();
  const step = (appId, direction) =>
    applyTierMove(ranking, planTierStep(buildTierBoard(ranking.getResult()), appId, direction));

  assert.ok(step(10, 'right'));
  assert.deepEqual(layout(ranking).must, [20, 10, 30]);
  assert.ok(step(10, 'left'));
  assert.deepEqual(layout(ranking).must, [10, 20, 30]);
});

test('a step sideways stops at the ends of the row', () => {
  const board = buildTierBoard(twoRows().getResult());

  assert.equal(planTierStep(board, 10, 'left'), null);
  assert.equal(planTierStep(board, 30, 'right'), null);
});

test('a step up or down carries the card to the same place along the next row', () => {
  const ranking = twoRows();
  const board = buildTierBoard(ranking.getResult());

  // `30` is third in `must`; `want` holds three, so third it stays.
  assert.ok(applyTierMove(ranking, planTierStep(board, 30, 'down')));
  assert.deepEqual(layout(ranking).want, [40, 50, 30, 60]);
  assert.equal(ranking.getCategory(30), 'want');

  // And back: `must` is two long now, so the third place it came from is the
  // end of the row.
  assert.ok(applyTierMove(ranking, planTierStep(buildTierBoard(ranking.getResult()), 30, 'up')));
  assert.deepEqual(layout(ranking).must, [10, 20, 30]);
});

test('a step down walks the whole ladder, through the empty rows to the removal one', () => {
  const ranking = twoRows();
  const step = (appId, direction) =>
    applyTierMove(ranking, planTierStep(buildTierBoard(ranking.getResult()), appId, direction));

  const walked = [];
  for (let at = 0; at < TIER_ROW_IDS.length - 1; at += 1) {
    assert.ok(step(10, 'down'), `the step out of row ${at} was refused`);
    walked.push(
      buildTierBoard(ranking.getResult()).find((tier) =>
        tier.items.some((card) => card.appId === 10)).id,
    );
  }

  assert.deepEqual(walked, TIER_ROW_IDS.slice(1));
  assert.equal(ranking.getCategory(10), 'remove');
  assert.equal(planTierStep(buildTierBoard(ranking.getResult()), 10, 'down'), null);
});

test('a step stops at the top of the ladder as well', () => {
  const board = buildTierBoard(twoRows().getResult());

  assert.equal(planTierStep(board, 10, 'up'), null, 'there is nothing above the first row');
  assert.equal(planTierStep(board, 999, 'down'), null, 'a card that is not on the board goes nowhere');
});

/* ------------------------------------------------- after a series of them */

test('a series of moves leaves a result that still agrees with itself', () => {
  const ranking = twoRows();
  ranking.submitAnswer('a', { a: 40, b: 60 });

  drop(ranking, { appId: 10, row: 'want', anchor: 60, side: 'after' });
  drop(ranking, { appId: 50, row: 'must', anchor: 20, side: 'before' });
  drop(ranking, { appId: 30, row: TIER_NONE, anchor: null });
  drop(ranking, { appId: 20, row: TIER_REMOVE, anchor: null });
  applyTierMove(ranking, planTierStep(buildTierBoard(ranking.getResult()), 50, 'down'));

  const result = ranking.getResult();
  const board = buildTierBoard(result);
  const placed = board.flatMap((tier) => tier.items.map((card) => card.appId));

  assert.equal(new Set(placed).size, placed.length, 'an app id shows up in two rows');
  assert.deepEqual([...placed].sort((a, b) => a - b), [10, 20, 30, 40, 50, 60]);
  assert.deepEqual(
    result.entries.map((entry) => entry.position),
    [1, 2, 3, 4, 5],
    'the places are still one to five, with the marked item out of the count',
  );

  // The rows are the entries seen from the side, so reading the board top to
  // bottom has to give the numbered list back exactly.
  assert.deepEqual(
    board.filter((tier) => tier.id !== TIER_REMOVE).flatMap((tier) => tier.items.map((card) => card.appId)),
    result.entries.map((entry) => entry.appId),
  );
  for (const tier of board) {
    for (const card of tier.items) {
      assert.equal(ranking.getCategory(card.appId), tierRowCategory(tier.id));
    }
  }
});

test('the moves of the panel are the same manual layer the result screen resets', () => {
  const ranking = twoRows();
  drop(ranking, { appId: 10, row: 'must', anchor: 30, side: 'after' });
  drop(ranking, { appId: 40, row: 'must', anchor: 20, side: 'before' });

  assert.equal(ranking.manualMoveCount, 2);
  assert.deepEqual(layout(ranking).must, [40, 20, 30, 10]);

  ranking.clearManualMoves();

  // The category the drop set stays: it was a decision about the game and not
  // a placement, and only the placements are what «reset the manual moves»
  // undoes.
  assert.deepEqual(layout(ranking).must, [10, 20, 30, 40]);
  assert.equal(ranking.getCategory(40), 'must');
});

test('an entry with a category the model does not know joins the row without one', () => {
  // Not reachable through `setCategory()`, which validates the id — this is
  // what a state file edited by hand would look like by the time it reaches
  // the panel, and the item has to stay visible rather than vanish.
  const rows = buildTierList({
    entries: [{ appId: 99, item: item(99, 'Stray'), category: 'unheard-of', position: 1 }],
    removed: [],
  });

  assert.deepEqual(row(rows, TIER_NONE).items.map((card) => card.appId), [99]);
});
