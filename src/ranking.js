/**
 * The ranking core: preference graph, pair scheduler and result builder.
 *
 * ## Why a graph and not a merge sort
 *
 * A classic merge sort cannot be used here. It has to know the outcome of the
 * current comparison before it can continue merging, so the two answers this
 * application must support break it: "about the same" needs a non-strict order,
 * and "cannot decide" needs the ability to postpone a pair and keep working.
 *
 * So the source of truth is a graph instead:
 *
 *  - an edge `A -> B` means "A is above B";
 *  - a disjoint-set structure keeps groups of items the user called equal.
 *
 * Everything the interface needs falls out of that structure for free:
 * transitivity (a pair implied by the graph is never asked), undo (the answer
 * is dropped and the graph is replayed), removal of an item (its node is gone),
 * ties (two nodes are merged into one group).
 *
 * ## The scheduler
 *
 * On top of the graph runs a binary insertion scheduler, per category:
 * the items already placed form a chain, the next item is inserted into that
 * chain by binary search, and every probe is answered by the graph when it can
 * be. Only a probe the graph cannot answer becomes a question for the user,
 * which gives O(n log n) comparisons instead of the O(n^2) of naive sorting.
 *
 * A postponed pair does not stall the scheduler: the item that needs it is
 * skipped and the next item is inserted instead. Because inserting other items
 * makes the chain grow, a postponed pair usually stops being needed at all.
 * When every remaining question is postponed the scheduler reports a deadlock:
 * the pair postponed first is shown again and marked as unavoidable.
 *
 * ## State
 *
 * The whole state is the list of items, their categories and an append-only
 * history of user actions. Everything else — graph, groups, postponed queue,
 * scheduler position — is derived from it by a deterministic replay. That is
 * what makes `serialize()`/`deserialize()` lossless and `undo()` exact: after a
 * reload the scheduler offers exactly the same pair it offered before.
 *
 * ## Manual order
 *
 * Dragging a line in the final list is an edit of the list, not an answer to a
 * question, and the two are kept apart on purpose:
 *
 *  - an answer is a statement about a pair and goes into the graph, which is
 *    append-only and must stay free of contradictions;
 *  - a drag is a statement about the list itself, and it may well contradict
 *    an answer given ten minutes earlier. Feeding it to the graph would mean
 *    either refusing the drag or deleting edges, and both are worse than
 *    keeping the two layers separate.
 *
 * So a move is recorded as `ManualMove` — "this item goes right after that one"
 * — and the moves are replayed on top of whatever the comparisons produce, in
 * the order they were made. Consequences, all intended:
 *
 *  - new answers keep improving the list, and the hand-made placements are
 *    re-applied over the new order instead of being wiped by it;
 *  - a move whose anchor left the category is not lost, it simply does not
 *    apply until the anchor comes back, exactly like an answer;
 *  - where a move disagrees with the comparisons, the move wins in the list
 *    and the line is marked as placed by hand, so nothing is passed off as
 *    a result of the sorting;
 *  - the scheduler is not affected: it goes on asking the same questions,
 *    because a drag never claimed to answer one.
 */

import {
  CATEGORY_IDS,
  UNCATEGORIZED,
  categoryRank,
  compareByWishlistPosition,
  createItem,
  isCategoryId,
  isSortableCategory,
} from './model.js';

/** Version of the serialized session format. */
export const SESSION_FORMAT_VERSION = 1;

/** Error thrown for invalid arguments and impossible answers. */
export class RankingError extends Error {
  /**
   * @param {string} code Machine readable reason.
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'RankingError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ bitsets */

const bitsetWords = (size) => Math.max(1, Math.ceil(size / 32));
const testBit = (bits, index) => (bits[index >>> 5] & (1 << (index & 31))) !== 0;
const setBit = (bits, index) => {
  bits[index >>> 5] |= 1 << (index & 31);
};

function orInto(target, source) {
  for (let i = 0; i < target.length; i += 1) target[i] |= source[i];
}

function collectBits(bits) {
  const result = [];
  for (let word = 0; word < bits.length; word += 1) {
    let value = bits[word];
    while (value !== 0) {
      const bit = 31 - Math.clz32(value & -value);
      result.push(word * 32 + bit);
      value &= value - 1;
    }
  }
  return result;
}

/* --------------------------------------------------------- preference graph */

/**
 * Directed acyclic graph of "is above" relations over a fixed set of app ids,
 * plus a union-find of tie groups.
 *
 * The transitive closure is kept as two bitsets per node (ancestors and
 * descendants), which makes `relation()` a constant time lookup — the
 * scheduler asks it thousands of times per session.
 */
export class PreferenceGraph {
  /** @type {number[]} */ #ids;
  /** @type {Map<number, number>} */ #index;
  /** @type {Int32Array} */ #parent;
  /** @type {Int32Array} */ #groupSize;
  /** @type {Uint32Array[]} */ #ancestors;
  /** @type {Uint32Array[]} */ #descendants;
  /** @type {Array<[number, number]>} */ #edges = [];
  /** @type {Array<[number, number]>} */ #ties = [];

  /**
   * @param {number[]} ids App ids that take part in the comparisons.
   */
  constructor(ids) {
    this.#ids = [...ids];
    this.#index = new Map(this.#ids.map((id, index) => [id, index]));
    this.#reset();
  }

  #reset() {
    const size = this.#ids.length;
    const words = bitsetWords(size);
    this.#parent = new Int32Array(size);
    this.#groupSize = new Int32Array(size).fill(1);
    this.#ancestors = [];
    this.#descendants = [];
    for (let i = 0; i < size; i += 1) {
      this.#parent[i] = i;
      this.#ancestors.push(new Uint32Array(words));
      this.#descendants.push(new Uint32Array(words));
    }
  }

  #indexOf(appId) {
    const index = this.#index.get(appId);
    if (index === undefined) {
      throw new RankingError('unknown-item', `Ranking: app ${appId} is not part of the comparisons`);
    }
    return index;
  }

  #root(index) {
    let node = index;
    while (this.#parent[node] !== node) {
      this.#parent[node] = this.#parent[this.#parent[node]];
      node = this.#parent[node];
    }
    return node;
  }

  /**
   * Representative app id of the tie group an item belongs to.
   *
   * @param {number} appId
   * @returns {number}
   */
  find(appId) {
    return this.#ids[this.#root(this.#indexOf(appId))];
  }

  /**
   * Known relation between two items.
   *
   * @param {number} a
   * @param {number} b
   * @returns {'above'|'below'|'equal'|'unknown'} How `a` relates to `b`.
   */
  relation(a, b) {
    const rootA = this.#root(this.#indexOf(a));
    const rootB = this.#root(this.#indexOf(b));
    if (rootA === rootB) return 'equal';
    if (testBit(this.#descendants[rootA], rootB)) return 'above';
    if (testBit(this.#descendants[rootB], rootA)) return 'below';
    return 'unknown';
  }

  /**
   * Records "above is higher than below".
   *
   * @param {number} above
   * @param {number} below
   * @returns {boolean} `false` when the relation was already implied.
   * @throws {RankingError} When the answer contradicts what is already known.
   */
  addPreference(above, below) {
    const u = this.#root(this.#indexOf(above));
    const v = this.#root(this.#indexOf(below));
    if (u === v) {
      throw new RankingError('contradiction', `Ranking: ${above} and ${below} are already equal`);
    }
    if (testBit(this.#descendants[v], u)) {
      throw new RankingError('contradiction', `Ranking: ${below} is already known to be above ${above}`);
    }
    this.#edges.push([above, below]);
    if (testBit(this.#descendants[u], v)) return false;
    this.#applyEdge(u, v);
    return true;
  }

  /**
   * Records that two items are equally wanted, merging their groups.
   *
   * @param {number} a
   * @param {number} b
   * @returns {boolean} `false` when they were already in the same group.
   * @throws {RankingError} When one of them is already known to be above the other.
   */
  addTie(a, b) {
    const relation = this.relation(a, b);
    if (relation === 'above' || relation === 'below') {
      throw new RankingError('contradiction', `Ranking: ${a} and ${b} are already ordered`);
    }
    this.#ties.push([a, b]);
    if (relation === 'equal') return false;
    this.#rebuild();
    return true;
  }

  /**
   * Direct edges between the group representatives of the given items.
   * Used to build the final order by topological sort.
   *
   * @param {Set<number>} roots Representative app ids to keep.
   * @returns {Array<[number, number]>} Pairs `[above, below]`, deduplicated.
   */
  directEdgesAmong(roots) {
    const seen = new Set();
    const result = [];
    for (const [above, below] of this.#edges) {
      if (!this.#index.has(above) || !this.#index.has(below)) continue;
      const from = this.find(above);
      const to = this.find(below);
      if (from === to || !roots.has(from) || !roots.has(to)) continue;
      const key = `${from}>${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push([from, to]);
    }
    return result;
  }

  #applyEdge(u, v) {
    const below = this.#descendants[v].slice();
    setBit(below, v);
    const above = this.#ancestors[u].slice();
    setBit(above, u);

    for (const ancestor of collectBits(above)) orInto(this.#descendants[ancestor], below);
    for (const descendant of collectBits(below)) orInto(this.#ancestors[descendant], above);
  }

  /**
   * Rebuilds the closure from the recorded answers. Called after a tie merges
   * two groups, which invalidates the bitsets of every node that referenced
   * either of them.
   */
  #rebuild() {
    const edges = this.#edges;
    const ties = this.#ties;
    this.#reset();

    for (const [a, b] of ties) {
      const rootA = this.#root(this.#indexOf(a));
      const rootB = this.#root(this.#indexOf(b));
      if (rootA === rootB) continue;
      const [keep, drop] =
        this.#groupSize[rootA] >= this.#groupSize[rootB] ? [rootA, rootB] : [rootB, rootA];
      this.#parent[drop] = keep;
      this.#groupSize[keep] += this.#groupSize[drop];
    }

    for (const [above, below] of edges) {
      const u = this.#root(this.#indexOf(above));
      const v = this.#root(this.#indexOf(below));
      // Answers that a later tie turned into a contradiction are dropped: the
      // most recent statement of the user wins.
      if (u === v || testBit(this.#descendants[v], u) || testBit(this.#descendants[u], v)) continue;
      this.#applyEdge(u, v);
    }
  }
}

/* ------------------------------------------------------------------ session */

const pairKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

const VERDICT_ALIASES = new Map([
  ['a', 'a'],
  ['left', 'a'],
  ['first', 'a'],
  ['b', 'b'],
  ['right', 'b'],
  ['second', 'b'],
  ['tie', 'tie'],
  ['equal', 'tie'],
  ['same', 'tie'],
  ['defer', 'defer'],
  ['skip', 'defer'],
  ['unsure', 'defer'],
]);

/**
 * @param {unknown} value An item or an app id.
 * @returns {number}
 */
function appIdOf(value) {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && typeof value.appId === 'number') return value.appId;
  const parsed = Number(value);
  if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  throw new RankingError('invalid-item', `Ranking: ${JSON.stringify(value ?? null)} is not an app id`);
}

/**
 * One line of the final list.
 *
 * @typedef {Object} ResultEntry
 * @property {number} position           Number in the whole list, 1-based.
 * @property {number} positionInCategory Number inside its category, 1-based.
 * @property {number} appId
 * @property {import('./model.js').WishlistItem} item
 * @property {string|null} category
 * @property {number} group              Representative app id of the tie group.
 * @property {boolean} tiedWithPrevious  The entry above is equally wanted.
 * @property {boolean} linkedToPrevious  The order against the entry above comes
 *                                       from the comparisons, not the fallback.
 * @property {boolean} resolved          Both neighbours are settled by comparisons;
 *                                       the interface marks the rest as not sorted yet.
 * @property {boolean} manual            The user put this line here by hand.
 */

/**
 * An explicit placement made by hand in the final list.
 *
 * The move is stored relative to a neighbour rather than as a number, which is
 * what lets it survive: the list is renumbered by every new answer, but "right
 * after Portal 2" keeps meaning the same thing.
 *
 * @typedef {Object} ManualMove
 * @property {number} appId  The item that was moved.
 * @property {number} anchor The item it was dropped next to.
 * @property {'before'|'after'} side Which side of the anchor it landed on.
 */

/**
 * A ranking session: the items, their categories and every answer given so far.
 */
export class RankingSession {
  /** @type {Map<number, import('./model.js').WishlistItem>} */ #items = new Map();
  /** @type {Map<number, string|null>} */ #categories = new Map();
  /** @type {Array<{type: string, a: number, b: number, verdict?: string}>} */ #history = [];
  /** @type {ManualMove[]} */ #moves = [];
  /** @type {string[]|null} */ #selection = null;
  /** @type {PreferenceGraph} */ #graph;
  /** @type {string[]} */ #deferred = [];
  /** @type {object|null} */ #planCache = null;
  /** @type {number} */ #comparisons = 0;
  /** @type {Map<string|null, number>} */ #comparisonsByCategory = new Map();

  /**
   * @param {{ items?: import('./model.js').WishlistItem[],
   *           categories?: Iterable<[number, string|null]>,
   *           sortedCategories?: string[]|null,
   *           history?: Array<{type: string, a: number, b: number, verdict?: string}>,
   *           moves?: ManualMove[] }} [options]
   */
  constructor(options = {}) {
    for (const item of options.items ?? []) {
      const normalized = createItem(item);
      this.#items.set(normalized.appId, normalized);
    }
    for (const [appId, category] of options.categories ?? []) {
      if (isCategoryId(category)) this.#categories.set(Number(appId), category);
    }
    this.#selection = normalizeSelection(options.sortedCategories);
    this.#history = sanitizeHistory(options.history);
    this.#moves = sanitizeMoves(options.moves);
    this.#rebuild();
  }

  /* ------------------------------------------------------------ items */

  /**
   * Replaces the item set, keeping categories and answers of the items that
   * survive. This is what a repeated import calls.
   *
   * @param {import('./model.js').WishlistItem[]} items
   */
  setItems(items) {
    this.#items = new Map();
    for (const item of items) {
      const normalized = createItem(item);
      this.#items.set(normalized.appId, normalized);
    }
    this.#rebuild();
  }

  /**
   * Adds or refreshes items without dropping the ones already known.
   *
   * @param {import('./model.js').WishlistItem[]} items
   */
  addItems(items) {
    for (const item of items) {
      const normalized = createItem(item);
      this.#items.set(normalized.appId, normalized);
    }
    this.#rebuild();
  }

  /** @returns {import('./model.js').WishlistItem[]} Items in wishlist order. */
  getItems() {
    return [...this.#items.values()].sort(compareByWishlistPosition);
  }

  /**
   * @param {number} appId
   * @returns {import('./model.js').WishlistItem|undefined}
   */
  getItem(appId) {
    return this.#items.get(appId);
  }

  /** @returns {number} How many items the session holds. */
  get itemCount() {
    return this.#items.size;
  }

  /**
   * Drops an item completely, together with every answer that mentions it.
   * Safe to call in the middle of the sorting: the rest of the state stays
   * valid and the scheduler simply continues without that item.
   *
   * @param {number|import('./model.js').WishlistItem} item
   * @returns {boolean} `false` when the session did not have that item.
   */
  removeItem(item) {
    const appId = appIdOf(item);
    if (!this.#items.has(appId)) return false;
    this.#items.delete(appId);
    this.#categories.delete(appId);
    this.#history = this.#history.filter((entry) => entry.a !== appId && entry.b !== appId);
    this.#moves = this.#moves.filter((move) => move.appId !== appId && move.anchor !== appId);
    this.#rebuild();
    return true;
  }

  /* ------------------------------------------------------- categories */

  /**
   * @param {number|import('./model.js').WishlistItem} item
   * @param {string|null} categoryId
   */
  setCategory(item, categoryId) {
    const appId = appIdOf(item);
    if (!this.#items.has(appId)) {
      throw new RankingError('unknown-item', `Ranking: app ${appId} is not in the session`);
    }
    if (!isCategoryId(categoryId)) {
      throw new RankingError('unknown-category', `Ranking: unknown category ${JSON.stringify(categoryId)}`);
    }
    if (categoryId === UNCATEGORIZED) this.#categories.delete(appId);
    else this.#categories.set(appId, categoryId);
    // Answers between items that no longer share a category stop being applied,
    // but they are kept in the history: moving the item back restores them.
    this.#rebuild();
  }

  /**
   * @param {number|import('./model.js').WishlistItem} item
   * @returns {string|null}
   */
  getCategory(item) {
    return this.#categories.get(appIdOf(item)) ?? UNCATEGORIZED;
  }

  /** @returns {Array<[number, string]>} Explicit category assignments. */
  getCategoryAssignments() {
    return [...this.#categories.entries()];
  }

  /**
   * Restricts the sorting to the given categories. `null` means every sortable
   * category, which is the default. Categories left out keep their answers and
   * their place in the result, they are simply never asked about.
   *
   * @param {string[]|null} categories Category ids, `null` for the whole list.
   */
  setSortedCategories(categories) {
    this.#selection = normalizeSelection(categories);
    this.#planCache = null;
  }

  /** @returns {string[]|null} */
  getSortedCategories() {
    return this.#selection === null ? null : [...this.#selection];
  }

  /* --------------------------------------------------------- sorting */

  /**
   * The pair to show next.
   *
   * @returns {{ a: import('./model.js').WishlistItem,
   *             b: import('./model.js').WishlistItem,
   *             category: string|null,
   *             forced: boolean,
   *             reason: string|null,
   *             deferredCount: number }|null}
   *          `null` when nothing is left to ask.
   */
  getNextPair() {
    const plan = this.#plan();
    const open = plan.questions.find((question) => !this.#deferred.includes(question.key));
    if (open) return this.#describePair(open, false, null);

    if (plan.questions.length === 0) return null;

    // Deadlock: everything the scheduler needs has been postponed. The pair
    // postponed first comes back, flagged, because there is no way forward
    // without an answer to one of them.
    for (const key of this.#deferred) {
      const question = plan.questions.find((candidate) => candidate.key === key);
      if (question) return this.#describePair(question, true, 'all-deferred');
    }
    return this.#describePair(plan.questions[0], true, 'all-deferred');
  }

  #describePair(question, forced, reason) {
    return {
      a: this.#items.get(question.a),
      b: this.#items.get(question.b),
      category: question.category,
      forced,
      reason,
      deferredCount: this.#deferred.length,
    };
  }

  /**
   * Records the user's answer for a pair.
   *
   * @param {'a'|'b'|'tie'|'defer'|'left'|'right'|'equal'|'skip'} verdict
   *        `a`/`b` — that side is higher, `tie` — equally wanted,
   *        `defer` — cannot decide, postpone the pair.
   * @param {{a: number|object, b: number|object}} [pair] Defaults to `getNextPair()`.
   * @returns {void}
   * @throws {RankingError} On an unknown verdict, an unusable pair or an answer
   *         that contradicts the graph.
   */
  submitAnswer(verdict, pair) {
    const normalized = VERDICT_ALIASES.get(String(verdict).toLowerCase());
    if (!normalized) {
      throw new RankingError('unknown-verdict', `Ranking: unknown verdict ${JSON.stringify(verdict)}`);
    }

    const target = pair ?? this.getNextPair();
    if (!target) throw new RankingError('no-pair', 'Ranking: there is no pair to answer');

    const a = appIdOf(target.a);
    const b = appIdOf(target.b);
    this.#assertComparable(a, b);

    if (normalized === 'defer') {
      this.#history.push({ type: 'defer', a, b });
      this.#pushDeferred(pairKey(a, b));
      this.#planCache = null;
      return;
    }

    const entry = { type: 'answer', a, b, verdict: normalized };
    this.#applyAnswer(entry);
    this.#history.push(entry);
    this.#planCache = null;
  }

  /**
   * Shorthand for `submitAnswer('defer', pair)`.
   *
   * @param {{a: number|object, b: number|object}} [pair]
   */
  defer(pair) {
    this.submitAnswer('defer', pair);
  }

  /** @returns {boolean} Whether there is an action to undo. */
  canUndo() {
    return this.#history.length > 0;
  }

  /**
   * Undoes the last action, an answer or a postponement alike. The graph and
   * the scheduler are replayed from the shortened history, so the session ends
   * up exactly where it was before that action.
   *
   * @returns {boolean} `false` when there was nothing to undo.
   */
  undo() {
    if (this.#history.length === 0) return false;
    this.#history.pop();
    this.#rebuild();
    return true;
  }

  /**
   * Drops every answer, keeping the items and their categories. What the user
   * asks for when the sorting went wrong early and redoing it is cheaper than
   * undoing forty comparisons one by one.
   *
   * @returns {boolean} `false` when there was nothing to drop.
   */
  clearAnswers() {
    if (this.#history.length === 0) return false;
    this.#history = [];
    this.#rebuild();
    return true;
  }

  /* --------------------------------------------------- manual order */

  /**
   * Records that the user put an item right next to another one in the final
   * list. See the note on the manual order at the top of the module for what
   * this does and does not mean.
   *
   * @param {number|import('./model.js').WishlistItem} item
   * @param {number|import('./model.js').WishlistItem} anchor The neighbour it was dropped on.
   * @param {'before'|'after'} [side] Which side of the anchor it lands on.
   * @returns {void}
   * @throws {RankingError} When the two cannot stand next to each other: one of
   *         them is unknown, they are the same item, they are in different
   *         categories or the category is not part of the list.
   */
  moveItem(item, anchor, side = 'after') {
    if (side !== 'before' && side !== 'after') {
      throw new RankingError('invalid-side', `Ranking: unknown side ${JSON.stringify(side)}`);
    }
    const appId = appIdOf(item);
    const anchorId = appIdOf(anchor);
    this.#assertComparable(appId, anchorId);

    // Only the latest placement of an item counts, so dragging the same line
    // back and forth leaves one move behind instead of a trail of them.
    this.#moves = this.#moves.filter((move) => move.appId !== appId);
    this.#moves.push({ appId, anchor: anchorId, side });
  }

  /** @returns {ManualMove[]} The placements made by hand, oldest first. */
  getManualMoves() {
    return this.#moves.map((move) => ({ ...move }));
  }

  /** @returns {number} How many items were placed by hand. */
  get manualMoveCount() {
    return this.#moves.length;
  }

  /**
   * Forgets every manual placement, so the list goes back to what the
   * comparisons and the fallback order say.
   *
   * @returns {boolean} `false` when there was nothing to forget.
   */
  clearManualMoves() {
    if (this.#moves.length === 0) return false;
    this.#moves = [];
    return true;
  }

  /**
   * @returns {{ comparisons: number, deferred: number, remaining: number,
   *             total: number, percent: number, done: boolean,
   *             categories: Array<object> }}
   *          `remaining` and `total` are estimates: the exact number of
   *          comparisons depends on the answers still to come.
   */
  getProgress() {
    const plan = this.#plan();
    let remaining = 0;
    const categories = [];

    for (const bucket of plan.buckets) {
      const estimate = estimateComparisons(bucket.placed, bucket.pending);
      remaining += estimate;
      categories.push({
        category: bucket.category,
        items: bucket.total,
        placed: bucket.placed,
        pending: bucket.pending,
        comparisons: this.#comparisonsByCategory.get(bucket.category) ?? 0,
        remaining: estimate,
        done: bucket.pending === 0,
      });
    }

    const total = this.#comparisons + remaining;
    return {
      comparisons: this.#comparisons,
      deferred: this.#deferred.length,
      remaining,
      total,
      percent: total === 0 ? 100 : Math.round((this.#comparisons / total) * 100),
      done: plan.questions.length === 0,
      categories,
    };
  }

  /**
   * The current ranking. Works on any state, including an empty and a half
   * finished one: whatever the graph implies is ordered topologically, and
   * everything it does not imply falls back to the original wishlist order.
   *
   * Placements made by hand are replayed on top of that order, so the list the
   * user arranged is the list they get back after a reload.
   *
   * @returns {{ entries: ResultEntry[],
   *             removed: import('./model.js').WishlistItem[],
   *             summary: { total: number, resolved: number, fallback: number,
   *                        manual: number, removed: number, comparisons: number,
   *                        complete: boolean } }}
   *          `removed` holds the items of the `remove` bucket, which is never
   *          numbered together with the rest. `manual` counts the lines the
   *          user placed by hand; they are counted by `resolved`/`fallback` as
   *          well, according to whether the comparisons agree with where they
   *          ended up.
   */
  getResult() {
    const buckets = new Map();
    /** @type {import('./model.js').WishlistItem[]} */
    const removed = [];

    for (const item of this.getItems()) {
      const category = this.getCategory(item.appId);
      if (!isSortableCategory(category)) {
        removed.push(item);
        continue;
      }
      const bucket = buckets.get(category);
      if (bucket) bucket.push(item);
      else buckets.set(category, [item]);
    }

    const order = [...buckets.keys()].sort((a, b) => categoryRank(a) - categoryRank(b));
    const ordered = new Map(
      order.map((category) => [category, this.#orderCategory(buckets.get(category))]),
    );
    const moved = this.#applyManualMoves(ordered);
    const entries = [];

    for (const category of order) {
      let previous = null;

      for (const [indexInCategory, item] of ordered.get(category).entries()) {
        const relationToPrevious = previous === null ? null : this.#graph.relation(previous.appId, item.appId);
        entries.push({
          position: entries.length + 1,
          positionInCategory: indexInCategory + 1,
          appId: item.appId,
          item,
          category,
          group: this.#graph.find(item.appId),
          tiedWithPrevious: relationToPrevious === 'equal',
          // A manual move can put a line above something the comparisons put
          // below it, so "the graph knows about this pair" is not enough: the
          // graph has to agree with the order actually shown.
          linkedToPrevious:
            previous === null || relationToPrevious === 'above' || relationToPrevious === 'equal',
          manual: moved.has(item.appId),
          resolved: false,
        });
        previous = item;
      }
    }

    // An entry is trusted when its place relative to both neighbours inside its
    // category comes from the comparisons rather than from the fallback order.
    entries.forEach((entry, index) => {
      const next = entries[index + 1];
      const linkedToNext = !next || next.category !== entry.category ? true : next.linkedToPrevious;
      entry.resolved = entry.linkedToPrevious && linkedToNext;
    });

    const resolved = entries.filter((entry) => entry.resolved).length;
    return {
      entries,
      removed,
      summary: {
        total: entries.length,
        resolved,
        fallback: entries.length - resolved,
        manual: moved.size,
        removed: removed.length,
        comparisons: this.#comparisons,
        complete: this.#plan().questions.length === 0,
      },
    };
  }

  /* --------------------------------------------------- serialization */

  /**
   * The whole session as plain JSON-safe data. Nothing derived is stored: the
   * graph and the scheduler are rebuilt from the history on load.
   *
   * @returns {object}
   */
  serialize() {
    return {
      version: SESSION_FORMAT_VERSION,
      items: this.getItems(),
      categories: this.getCategoryAssignments(),
      sortedCategories: this.getSortedCategories(),
      history: this.#history.map((entry) =>
        entry.type === 'answer'
          ? { type: 'answer', a: entry.a, b: entry.b, verdict: entry.verdict }
          : { type: 'defer', a: entry.a, b: entry.b },
      ),
      moves: this.getManualMoves(),
    };
  }

  /**
   * Restores a session from `serialize()` output.
   *
   * @param {object} data
   * @returns {RankingSession}
   */
  static deserialize(data) {
    return deserializeSession(data);
  }

  /* ------------------------------------------------------- internals */

  #categoryOf(appId) {
    return this.#categories.get(appId) ?? UNCATEGORIZED;
  }

  #assertComparable(a, b) {
    if (a === b) throw new RankingError('same-item', 'Ranking: an item cannot be compared with itself');
    for (const appId of [a, b]) {
      if (!this.#items.has(appId)) {
        throw new RankingError('unknown-item', `Ranking: app ${appId} is not in the session`);
      }
    }
    const categoryA = this.#categoryOf(a);
    const categoryB = this.#categoryOf(b);
    if (categoryA !== categoryB) {
      throw new RankingError('cross-category', 'Ranking: items of different categories are never compared');
    }
    if (!isSortableCategory(categoryA)) {
      throw new RankingError('not-sortable', `Ranking: category ${categoryA} does not take part in sorting`);
    }
  }

  #isApplicable(entry) {
    if (!this.#items.has(entry.a) || !this.#items.has(entry.b)) return false;
    const category = this.#categoryOf(entry.a);
    if (category !== this.#categoryOf(entry.b)) return false;
    return isSortableCategory(category);
  }

  #applyAnswer(entry) {
    if (entry.verdict === 'tie') this.#graph.addTie(entry.a, entry.b);
    else if (entry.verdict === 'a') this.#graph.addPreference(entry.a, entry.b);
    else this.#graph.addPreference(entry.b, entry.a);

    const category = this.#categoryOf(entry.a);
    this.#comparisons += 1;
    this.#comparisonsByCategory.set(category, (this.#comparisonsByCategory.get(category) ?? 0) + 1);
    const key = pairKey(entry.a, entry.b);
    const index = this.#deferred.indexOf(key);
    if (index !== -1) this.#deferred.splice(index, 1);
  }

  #pushDeferred(key) {
    const index = this.#deferred.indexOf(key);
    // Re-postponing a pair moves it to the back of the queue, so a deadlock
    // walks through every postponed pair instead of looping on the first one.
    if (index !== -1) this.#deferred.splice(index, 1);
    this.#deferred.push(key);
  }

  /**
   * Rebuilds every derived structure by replaying the history. Called after
   * undo, removal, a category change and a fresh import; the forward path
   * (`submitAnswer`) updates the graph incrementally instead.
   */
  #rebuild() {
    const sortableIds = this.getItems()
      .filter((item) => isSortableCategory(this.#categoryOf(item.appId)))
      .map((item) => item.appId);

    this.#graph = new PreferenceGraph(sortableIds);
    this.#deferred = [];
    this.#comparisons = 0;
    this.#comparisonsByCategory = new Map();

    for (const entry of this.#history) {
      if (!this.#isApplicable(entry)) continue;
      if (entry.type === 'defer') {
        this.#pushDeferred(pairKey(entry.a, entry.b));
        continue;
      }
      try {
        this.#applyAnswer(entry);
      } catch (error) {
        if (!(error instanceof RankingError)) throw error;
        // An answer that a later tie or category change turned into a
        // contradiction is dropped rather than allowed to break the replay.
      }
    }

    this.#deferred = this.#deferred.filter((key) => {
      const [a, b] = key.split(':').map(Number);
      if (!this.#items.has(a) || !this.#items.has(b)) return false;
      if (this.#categoryOf(a) !== this.#categoryOf(b)) return false;
      if (!isSortableCategory(this.#categoryOf(a))) return false;
      return this.#graph.relation(a, b) === 'unknown';
    });

    this.#planCache = null;
  }

  /** Buckets that take part in the sorting, in priority order. */
  #sortableBuckets() {
    const buckets = new Map();
    for (const item of this.getItems()) {
      const category = this.#categoryOf(item.appId);
      if (!isSortableCategory(category)) continue;
      if (this.#selection !== null && !this.#selection.includes(category)) continue;
      const bucket = buckets.get(category);
      if (bucket) bucket.push(item.appId);
      else buckets.set(category, [item.appId]);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => categoryRank(a) - categoryRank(b))
      .map(([category, ids]) => ({ category, ids }));
  }

  /**
   * Runs the scheduler over the whole state: replays the binary insertion in
   * every selected category, collects the comparisons it needs and how far
   * each category got. Cached until the state changes.
   */
  #plan() {
    if (this.#planCache) return this.#planCache;

    const questions = [];
    const buckets = [];

    for (const { category, ids } of this.#sortableBuckets()) {
      /** @type {number[]} Group representatives, ordered from the top. */
      const chain = [];
      const placed = new Set();

      for (const appId of ids) {
        const root = this.#graph.find(appId);
        if (placed.has(root)) continue;

        const probe = this.#probe(appId, chain);
        if (probe.type === 'merged') continue;
        if (probe.type === 'question') {
          const key = pairKey(appId, probe.other);
          if (!questions.some((question) => question.key === key)) {
            questions.push({ key, a: appId, b: probe.other, category });
          }
          // The item stays pending and the scheduler moves on: the chain keeps
          // growing, which often answers the missing comparison by transitivity.
          continue;
        }

        chain.splice(probe.index, 0, root);
        placed.add(root);
      }

      const pending = ids.filter((appId) => !placed.has(this.#graph.find(appId))).length;
      buckets.push({ category, total: ids.length, placed: chain.length, pending });
    }

    this.#planCache = { questions, buckets };
    return this.#planCache;
  }

  /**
   * Binary search of the place of `appId` in an ordered chain of groups. Every
   * probe the graph can answer is free; the first one it cannot becomes a
   * question for the user.
   *
   * @param {number} appId
   * @param {number[]} chain Group representatives, ordered from the top.
   * @returns {{ type: 'placed', index: number }
   *          |{ type: 'merged' }
   *          |{ type: 'question', other: number }}
   */
  #probe(appId, chain) {
    let low = 0;
    let high = chain.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      const relation = this.#graph.relation(appId, chain[middle]);
      if (relation === 'above') high = middle;
      else if (relation === 'below') low = middle + 1;
      // The item shares a group with something already placed, so the chain
      // already holds it. Reached only if a tie is recorded outside the
      // scheduler; inserting again would duplicate the group.
      else if (relation === 'equal') return { type: 'merged' };
      else return { type: 'question', other: chain[middle] };
    }
    return { type: 'placed', index: low };
  }

  /**
   * Replays the manual placements over the ordered categories, in the order
   * they were made. A move whose item or anchor is not in the same category
   * any more is skipped rather than dropped: putting the anchor back makes it
   * apply again, the same way a category change re-enables an old answer.
   *
   * @param {Map<string|null, import('./model.js').WishlistItem[]>} ordered
   *        Category lists, modified in place.
   * @returns {Set<number>} App ids that really were placed by hand.
   */
  #applyManualMoves(ordered) {
    const moved = new Set();

    for (const move of this.#moves) {
      const category = this.#categoryOf(move.appId);
      if (category !== this.#categoryOf(move.anchor)) continue;
      const list = ordered.get(category);
      if (!list) continue;

      const from = list.findIndex((item) => item.appId === move.appId);
      if (from === -1 || !list.some((item) => item.appId === move.anchor)) continue;

      const [item] = list.splice(from, 1);
      const anchorIndex = list.findIndex((candidate) => candidate.appId === move.anchor);
      list.splice(move.side === 'before' ? anchorIndex : anchorIndex + 1, 0, item);
      moved.add(move.appId);
    }

    return moved;
  }

  /**
   * Orders one category: a topological sort of the tie groups, where every
   * choice between groups that the graph leaves open is settled by the stable
   * fallback order. That is what makes a half finished session usable.
   */
  #orderCategory(items) {
    if (items.length <= 1) return [...items];

    const byId = new Map(items.map((item) => [item.appId, item]));
    const groups = new Map();
    for (const item of items) {
      const root = this.#graph.find(item.appId);
      const members = groups.get(root);
      if (members) members.push(item);
      else groups.set(root, [item]);
    }
    for (const members of groups.values()) members.sort(compareByWishlistPosition);

    const roots = new Set(groups.keys());
    const indegree = new Map([...roots].map((root) => [root, 0]));
    const outgoing = new Map([...roots].map((root) => [root, []]));

    for (const [above, below] of this.#graph.directEdgesAmong(roots)) {
      outgoing.get(above).push(below);
      indegree.set(below, indegree.get(below) + 1);
    }

    const rank = new Map(
      [...groups.entries()].map(([root, members]) => [root, members[0]]),
    );
    const available = [...roots].filter((root) => indegree.get(root) === 0);
    const result = [];

    while (available.length > 0) {
      let bestIndex = 0;
      for (let i = 1; i < available.length; i += 1) {
        if (compareByWishlistPosition(rank.get(available[i]), rank.get(available[bestIndex])) < 0) {
          bestIndex = i;
        }
      }
      const root = available.splice(bestIndex, 1)[0];
      result.push(...groups.get(root));
      for (const next of outgoing.get(root)) {
        const left = indegree.get(next) - 1;
        indegree.set(next, left);
        if (left === 0) available.push(next);
      }
    }

    if (result.length !== items.length) {
      // Defensive: a cycle cannot appear through the normal flow, but a partial
      // result is still better than a lost one.
      const emitted = new Set(result.map((item) => item.appId));
      for (const item of items) if (!emitted.has(item.appId)) result.push(byId.get(item.appId));
    }

    return result;
  }
}

/**
 * Number of comparisons a binary insertion still needs: inserting into a chain
 * of `k` groups costs ceil(log2(k + 1)) questions.
 *
 * @param {number} placed
 * @param {number} pending
 * @returns {number}
 */
function estimateComparisons(placed, pending) {
  let total = 0;
  for (let i = 0; i < pending; i += 1) {
    total += Math.ceil(Math.log2(placed + i + 1));
  }
  return total;
}

/**
 * @param {string[]|null|undefined} categories
 * @returns {string[]|null}
 */
function normalizeSelection(categories) {
  if (categories === null || categories === undefined) return null;
  if (!Array.isArray(categories)) {
    throw new RankingError('invalid-selection', 'Ranking: the category selection must be an array or null');
  }
  const selection = categories.filter((category) => isCategoryId(category) && isSortableCategory(category));
  return selection;
}

/**
 * Creates an empty session, optionally filled with items.
 *
 * @param {{ items?: import('./model.js').WishlistItem[],
 *           categories?: Iterable<[number, string|null]>,
 *           sortedCategories?: string[]|null }} [options]
 * @returns {RankingSession}
 */
export function createSession(options = {}) {
  return new RankingSession(options);
}

/**
 * Restores a session from `serialize()` output. The restored session offers
 * exactly the same next pair as the one that was saved.
 *
 * @param {object} data
 * @returns {RankingSession}
 * @throws {RankingError} When the data is not a session of a known version.
 */
export function deserializeSession(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new RankingError('invalid-state', 'Ranking: the session data is not an object');
  }
  if (data.version !== SESSION_FORMAT_VERSION) {
    throw new RankingError(
      'unsupported-version',
      `Ranking: session format ${data.version} is not supported (expected ${SESSION_FORMAT_VERSION})`,
    );
  }

  return new RankingSession({
    items: Array.isArray(data.items) ? data.items : [],
    categories: Array.isArray(data.categories) ? data.categories : [],
    sortedCategories: data.sortedCategories ?? null,
    history: Array.isArray(data.history) ? data.history : [],
    // Files written before the final list could be edited by hand simply have
    // no moves in them, which is exactly an empty manual order.
    moves: Array.isArray(data.moves) ? data.moves : [],
  });
}

/**
 * Drops history entries that are not well formed. Entries that are well formed
 * but no longer applicable (the item is gone, the categories differ) are kept:
 * the replay skips them, and a later change may make them meaningful again.
 *
 * @param {unknown} history
 * @returns {Array<{type: string, a: number, b: number, verdict?: string}>}
 */
function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const result = [];
  for (const entry of history) {
    if (!entry || typeof entry !== 'object') continue;
    const a = Number(entry.a);
    const b = Number(entry.b);
    if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a === b) continue;
    if (entry.type === 'defer') {
      result.push({ type: 'defer', a, b });
      continue;
    }
    const verdict = VERDICT_ALIASES.get(String(entry.verdict).toLowerCase());
    if (!verdict || verdict === 'defer') continue;
    result.push({ type: 'answer', a, b, verdict });
  }
  return result;
}

/**
 * Drops manual placements that are not well formed and keeps only the latest
 * one per item, the same rule `moveItem` applies while recording them.
 *
 * @param {unknown} moves
 * @returns {ManualMove[]}
 */
function sanitizeMoves(moves) {
  if (!Array.isArray(moves)) return [];
  const byItem = new Map();
  for (const move of moves) {
    if (!move || typeof move !== 'object') continue;
    const appId = Number(move.appId);
    const anchor = Number(move.anchor);
    if (!Number.isSafeInteger(appId) || appId <= 0) continue;
    if (!Number.isSafeInteger(anchor) || anchor <= 0 || anchor === appId) continue;
    const side = move.side === 'before' ? 'before' : 'after';
    byItem.delete(appId);
    byItem.set(appId, { appId, anchor, side });
  }
  return [...byItem.values()];
}

/**
 * Category ids that take part in the sorting, in priority order. Handy for the
 * interface that lets the user choose what to sort.
 *
 * @returns {string[]}
 */
export function sortableCategoryIds() {
  return CATEGORY_IDS.filter((id) => isSortableCategory(id));
}
