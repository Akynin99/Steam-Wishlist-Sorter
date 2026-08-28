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

import { categoryTitle, plural, renderItemCard } from './ui-common.js';

/**
 * @param {object} app
 * @returns {{ render: Function, handleKey: Function }}
 */
export function createCompareScreen(app) {
  const nodes = {
    category: document.getElementById('cmp-category'),
    done: document.getElementById('cmp-done'),
    left: document.getElementById('cmp-left'),
    percent: document.getElementById('cmp-percent'),
    deferred: document.getElementById('cmp-deferred'),
    bar: document.getElementById('cmp-bar'),
    pause: document.getElementById('cmp-pause'),
    stop: document.getElementById('cmp-stop'),
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
      app.toast(`Ответ не принят: ${error.message}`, 'error');
      render();
      return;
    }
    app.save();
    app.announce(describeAnswer(verdict, shown));
    render();
  }

  /**
   * Moves one side of the pair to «Удалить из желаемого».
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
    app.toast(`«${item.title}» — в списке на удаление из желаемого.`);
    render();
  }

  function undo() {
    if (!app.session.canUndo()) {
      app.toast('Отменять нечего.');
      return;
    }
    app.session.undo();
    app.save();
    app.announce('Последний ответ отменён.');
    render();
  }

  /**
   * @param {string} verdict
   * @param {{ a: object, b: object }} shown
   * @returns {string}
   */
  function describeAnswer(verdict, shown) {
    if (verdict === 'a') return `Выбрано: ${shown.a.title}.`;
    if (verdict === 'b') return `Выбрано: ${shown.b.title}.`;
    if (verdict === 'tie') return `${shown.a.title} и ${shown.b.title} — примерно одинаково.`;
    return 'Пара отложена.';
  }

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
  nodes.stop.addEventListener('click', () => app.show('result'));
  nodes.pause.addEventListener('click', () => {
    app.show('import');
    app.toast('Пауза. Всё сохранено — можно закрыть вкладку и вернуться позже.', 'ok');
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
        ? `Все остальные вопросы отложены (${next.deferredCount}), и без ответа на этот дальше не пройти. ` +
          'Можно ответить «примерно одинаково» — это тоже ответ, и сортировка пойдёт дальше.'
        : 'Эта пара нужна, чтобы двигаться дальше.';
  }

  function render() {
    const progress = app.session.getProgress();
    pair = app.session.getNextPair();

    nodes.done.textContent = String(progress.comparisons);
    nodes.left.textContent = String(progress.remaining);
    nodes.percent.textContent = `${progress.percent}%`;
    nodes.bar.style.width = `${progress.percent}%`;
    nodes.undo.disabled = !app.session.canUndo();

    nodes.deferred.hidden = progress.deferred === 0;
    nodes.deferred.textContent = progress.deferred === 0
      ? ''
      : `отложено: ${progress.deferred} ${plural(progress.deferred, ['пара', 'пары', 'пар'])}`;

    if (!pair) {
      nodes.versus.hidden = true;
      nodes.banner.hidden = true;
      nodes.doneNote.hidden = false;
      nodes.category.textContent = '—';
      nodes.doneText.textContent = app.session.itemCount === 0
        ? 'Сравнивать нечего: список пуст.'
        : 'Сравнивать больше нечего: порядок определён.';
      nodes.toResult.textContent = app.session.itemCount === 0 ? 'Перейти к импорту' : 'Посмотреть результат';
      return;
    }

    nodes.versus.hidden = false;
    nodes.doneNote.hidden = true;
    nodes.category.textContent = `Категория: ${categoryTitle(pair.category)}`;

    renderItemCard(nodes.a, pair.a, app.loadCovers);
    renderItemCard(nodes.b, pair.b, app.loadCovers);
    renderBanner(pair);
  }

  return { render, handleKey };
}
