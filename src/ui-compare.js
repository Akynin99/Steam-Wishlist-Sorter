/**
 * Stage 2: two items side by side.
 *
 * Which pair to ask about, how many are left and when the sorting is over are
 * all decided by `ranking.js`; this module shows the answer of the scheduler
 * and sends back what the user pressed.
 *
 * The letter hotkeys are read from `event.code`, so they keep working on a
 * Russian keyboard layout, where A/S/D sit under ф/ы/в.
 */

import { plural, t } from './i18n.js';
import { categoryLabel } from './model.js';
import { renderItemCard, setProgress } from './ui-common.js';

/**
 * @param {object} app
 * @returns {{ render: Function, handleKey: Function }}
 */
export function createCompareScreen(app) {
  const nodes = {
    heading: document.getElementById('compare-heading'),
    hint: document.getElementById('cmp-hint'),
    progress: document.getElementById('cmp-progress'),
    percent: document.getElementById('cmp-percent'),
    deferred: document.getElementById('cmp-deferred'),
    bar: document.getElementById('cmp-bar'),
    finish: document.getElementById('cmp-finish'),
    foot: document.getElementById('cmp-foot'),
    banner: document.getElementById('cmp-banner'),
    versus: document.getElementById('cmp-versus'),
    undo: document.getElementById('cmp-undo'),
    doneNote: document.getElementById('cmp-done-note'),
    doneText: document.getElementById('cmp-done-text'),
    toResult: document.getElementById('cmp-to-result'),
    a: {
      cover: document.getElementById('cmp-cover-a'),
      title: document.getElementById('cmp-title-a'),
      kind: document.getElementById('cmp-kind-a'),
      link: document.getElementById('cmp-link-a'),
    },
    b: {
      cover: document.getElementById('cmp-cover-b'),
      title: document.getElementById('cmp-title-b'),
      kind: document.getElementById('cmp-kind-b'),
      link: document.getElementById('cmp-link-b'),
    },
  };

  /** The pair currently on the screen, so an answer cannot land on another. */
  let pair = null;

  /**
   * Sends an answer for the pair that is shown.
   *
   * @param {'a'|'b'|'tie'|'defer'} verdict
   */
  function answer(verdict) {
    if (!pair) return;
    const shown = pair;
    try {
      app.session.submitAnswer(verdict, shown);
    } catch (error) {
      // The scheduler never offers a pair it would refuse, so this only fires
      // when the state changed under the screen; re-rendering resolves it.
      app.toast(t('compare.rejected', { message: error.message }), 'error');
      render();
      return;
    }
    app.save();
    app.announce(describeAnswer(verdict, shown));
    render();
  }

  /**
   * Moves one side of the pair to the removal bucket.
   *
   * The item stays in the session with its answers: it simply leaves the
   * sorting and shows up in a separate list in the result, so the choice is
   * reversible on the categories screen.
   *
   * @param {'a'|'b'} side
   */
  function drop(side) {
    if (!pair) return;
    const item = pair[side];
    app.session.setCategory(item.appId, 'remove');
    app.save();
    app.toast(t('compare.dropped', { title: item.title }));
    render();
  }

  function undo() {
    if (!app.session.canUndo()) {
      app.toast(t('compare.nothingToUndo'));
      return;
    }
    app.session.undo();
    app.save();
    app.announce(t('compare.undone'));
    render();
  }

  /**
   * @param {string} verdict
   * @param {{ a: object, b: object }} shown
   * @returns {string}
   */
  function describeAnswer(verdict, shown) {
    if (verdict === 'a') return t('compare.chosen', { title: shown.a.title });
    if (verdict === 'b') return t('compare.chosen', { title: shown.b.title });
    if (verdict === 'tie') return t('compare.tied', { a: shown.a.title, b: shown.b.title });
    return t('compare.postponed');
  }

  // Found once, when the screen is built. The markup of the pair is never
  // rebuilt — only refilled — so these listeners outlive every render.
  for (const button of document.querySelectorAll('#screen-compare [data-answer]')) {
    button.addEventListener('click', () => answer(button.dataset.answer));
  }
  for (const button of document.querySelectorAll('#screen-compare [data-drop]')) {
    button.addEventListener('click', () => drop(button.dataset.drop));
  }

  nodes.undo.addEventListener('click', undo);
  nodes.toResult.addEventListener('click', () => {
    app.show(app.session.itemCount === 0 ? 'import' : 'result');
  });

  // One way out of the stage: stopping for today and looking at what came of
  // it are the same wish, so it leads to the result and says that the work is
  // where the user left it.
  nodes.finish.addEventListener('click', () => {
    app.show('result');
    app.toast(t('compare.finishNote'), 'ok');
  });

  /**
   * @param {KeyboardEvent} event
   */
  function handleKey(event) {
    if (event.repeat) return;

    if (event.key === 'Backspace') {
      event.preventDefault();
      undo();
      return;
    }

    if (!pair) return;

    const verdict = verdictForKey(event);
    if (!verdict) return;
    event.preventDefault();
    answer(verdict);
  }

  /**
   * @param {KeyboardEvent} event
   * @returns {'a'|'b'|'tie'|'defer'|null}
   */
  function verdictForKey(event) {
    if (event.code === 'KeyA' || event.key === 'ArrowLeft') return 'a';
    if (event.code === 'KeyD' || event.key === 'ArrowRight') return 'b';
    if (event.code === 'KeyS' || event.key === 'ArrowDown') return 'tie';
    if (event.key === ' ' || event.key === 'Spacebar') return 'defer';
    return null;
  }

  /**
   * Explains a pair the scheduler had to force back on the user.
   *
   * @param {object} next
   */
  function renderBanner(next) {
    if (!next.forced) {
      nodes.banner.hidden = true;
      nodes.banner.textContent = '';
      return;
    }

    nodes.banner.hidden = false;
    nodes.banner.textContent =
      next.reason === 'all-deferred'
        ? t('compare.banner.allDeferred', { count: next.deferredCount })
        : t('compare.banner.forced');
  }

  /**
   * Keeps the keyboard on the screen when the last answer takes the pair away.
   * The button that was pressed is inside the block that has just been hidden,
   * and a focus left on a hidden element drops back to the document.
   */
  function rescueFocus() {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && nodes.versus.contains(focused)) nodes.toResult.focus();
  }

  function render() {
    const progress = app.session.getProgress();
    pair = app.session.getNextPair();

    nodes.percent.textContent = `${progress.percent}%`;
    setProgress(nodes.bar, progress.percent);
    nodes.undo.disabled = !app.session.canUndo();

    nodes.deferred.hidden = progress.deferred === 0;
    nodes.deferred.textContent = progress.deferred === 0
      ? ''
      : t('compare.deferred', { pairs: plural('count.pairs', progress.deferred) });

    if (!pair) {
      nodes.versus.hidden = true;
      nodes.banner.hidden = true;
      nodes.doneNote.hidden = false;
      // The way out of the stage goes where the note under the pair already
      // points, so it does not stand next to it saying the same thing twice.
      nodes.foot.hidden = true;
      // The head stops asking a question there is nothing left to answer.
      // Set here and not in the markup, because the markup carries the key of
      // the question; a change of language redraws through here either way.
      nodes.heading.textContent = t('compare.headingDone');
      nodes.hint.hidden = true;
      // Nothing is being sorted any more: no group is next and nothing is
      // left, so the line keeps the one number that still means something.
      nodes.progress.textContent = plural('count.comparisonsDone', progress.comparisons);
      nodes.doneText.textContent = t(app.session.itemCount === 0 ? 'compare.empty' : 'compare.done');
      nodes.toResult.textContent = t(app.session.itemCount === 0 ? 'compare.toImport' : 'compare.toResult');
      rescueFocus();
      return;
    }

    nodes.versus.hidden = false;
    nodes.doneNote.hidden = true;
    nodes.heading.textContent = t('compare.heading');
    nodes.hint.hidden = false;
    nodes.foot.hidden = false;

    // The whole progress in one line: the group being sorted, what has been
    // answered and roughly what is left of it.
    nodes.progress.textContent = t('compare.progress', {
      category: categoryLabel(pair.category),
      made: plural('count.comparisonsDone', progress.comparisons),
      left: plural('count.pairs', progress.remaining),
    });

    renderItemCard(nodes.a, pair.a, app.loadCovers);
    renderItemCard(nodes.b, pair.b, app.loadCovers);
    renderBanner(pair);
  }

  return { render, handleKey };
}
