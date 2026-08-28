# Steam Wishlist Sorter

[![tests](https://github.com/Akynin99/Steam-Wishlist-Sorter/actions/workflows/test.yml/badge.svg)](https://github.com/Akynin99/Steam-Wishlist-Sorter/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A local web application that turns a 200+ entry Steam wishlist into an honestly ordered list
through pairwise comparisons — no server, no backend, nothing leaves the browser.**

🇷🇺 [Русская версия — полная документация](README.md) · 🎮 [Live demo](https://akynin99.github.io/Steam-Wishlist-Sorter/)

> The interface is in Russian. This page is the short version of the Russian README, which documents
> everything in detail.

![The import screen](docs/screenshots/import.png)

---

## The problem

Steam sorts a wishlist by price, discount and date added — by everything except how much you actually
want to play the thing. And "rate every game from 1 to 10" does not work either: the scale drifts as
you go down a long list, ten buckets over 200 games leave twenty unordered games in each bucket, and
an absolute rating is a hard question — it asks you to hold the whole list in your head.

A pairwise question is one a human answers fast and confidently: **Hades or Hollow Knight?**
No scale, no context, no drift.

Comparing everything with everything would take 19,900 questions for 200 items. This application asks
about a thousand: the list is first split into six coarse "how much do I want it" buckets, and inside
a bucket a binary-insertion scheduler runs on top of a preference graph that derives everything that
already follows from the answers given.

| Categories | Comparisons | Final list |
| --- | --- | --- |
| ![Categories](docs/screenshots/categorize.png) | ![Comparisons](docs/screenshots/compare.png) | ![Result](docs/screenshots/results.png) |

---

## Running it

ES modules do not load over `file://`, so the page needs an HTTP origin. The server ships with the
project: `server.js`, plain Node, zero dependencies.

- **Windows:** install [Node.js](https://nodejs.org/) 20+ and run `start.bat` — it starts the server
  and opens <http://localhost:8080/>. Another port: `start.bat 9000`.
- **Anything else:** `node server.js`, then open <http://localhost:8080/>.
- **Tests:** `node --test`.

No `npm install`, no `npx`: the project has no third-party dependencies at all, and the tests are
written on the built-in `node:test` and `node:assert`. GitHub Actions runs the same command.

The [live demo](https://akynin99.github.io/Steam-Wishlist-Sorter/) is the very same static files on
GitHub Pages. Press **«Загрузить демо-набор»** (*Load the demo set*) on the import screen to walk
through all three stages without a wishlist of your own.

### Getting a wishlist in

Install [Tampermonkey](https://www.tampermonkey.net/), then
[`userscripts/steam-wishlist-export.user.js`](userscripts/steam-wishlist-export.user.js), open your
wishlist page and press **«Собрать список»** (*Collect the list*). The script scrolls the page for
you — the entries are lazily loaded, they are not all in the DOM at once — and saves a JSON file that
the import screen accepts.

If Steam has changed its markup and the script finds nothing, it says so and stops instead of writing
an empty file. The fallback is the public endpoint, opened in the browser and saved as a file
(CORS makes it unreadable from the page itself):

```
https://api.steampowered.com/IWishlistService/GetWishlist/v1?steamid=<SteamID64>
```

It returns app ids only; the application fills the store links and the cover images in from the id.

### Where the work is kept

Everything is stored in `localStorage` under `steam-wishlist-sorter/state`, saved after every action,
so the sorting survives a closed browser. **«Сохранить в файл»** (*Save to a file*) exports the whole
state as JSON — that is both the backup and the way to move to another machine.

**Sorting can be abandoned halfway.** The result screen works from the first minute: whatever already
follows from the answers is ordered, everything else keeps a stable fallback order by wishlist
position, and every line is marked with where its place came from — comparisons, fallback or your own
hand.

---

## Architecture

Vanilla JS, ES modules, no framework, no bundler, no transpilation. Node is only used for the tests
and the local static server.

| Module | Responsibility |
| --- | --- |
| [`src/model.js`](src/model.js) | the item model, the six categories, normalization of arbitrary input |
| [`src/import.js`](src/import.js) | five accepted JSON shapes → the model, plus a report of what could not be read |
| [`src/storage.js`](src/storage.js) | `localStorage` behind a swappable backend; state export and import |
| [`src/ranking.js`](src/ranking.js) | the core: preference graph, pair scheduler, manual-order layer, result builder |
| [`src/export.js`](src/export.js) | the result as JSON, CSV and plain text; DOM-free, so every byte is testable |
| [`src/ui-*.js`](src/) | the screens on top of the core, duplicating none of its logic |
| [`userscripts/`](userscripts/) | wishlist export, and a preview of transferring the order back |

### Why a preference graph and not a merge sort

A merge sort has to know the outcome of the current comparison before it can continue, and two of the
answers this tool must support break that: **"about the same"** produces a non-strict order with
groups of equals, and **"cannot decide"** has to postpone a pair and keep going. Undo and removing an
item mid-run would both mean starting over.

So the source of truth is a graph: an edge `A → B` means "A is above B", a union-find keeps the groups
of items called equal, and the transitive closure is held as ancestor/descendant bitsets, which makes
"what do we already know about this pair" a constant-time lookup. Transitivity, undo, item removal and
ties all fall out of that structure for free.

On top of it runs a per-category binary insertion scheduler: the placed items form a chain, the next
item is binary-searched into it, and every probe goes to the graph first — only a probe the graph
cannot answer becomes a question. That is O(n log n) questions instead of O(n²). A postponed pair does
not stall the run: the item is skipped, the chain grows, and the pair usually stops being needed.

The whole state is the items, their categories and an append-only history of actions; the graph,
groups and scheduler position are a deterministic replay of it. That is what makes saving lossless and
undo exact — after a reload the application offers the very same pair.

### Manual order as a separate layer

Dragging a line in the final list is an edit of the *list*; answering a comparison is a statement
about a *pair*. They are stored apart on purpose. A drag may well contradict an answer given ten
minutes earlier, and feeding it to the append-only graph would mean either refusing the drag or
deleting edges — both worse than two layers.

So a move is recorded as `{ appId, anchor, side }` — "this item goes right after that one" — and the
moves are replayed on top of whatever the comparisons currently produce. Relative to a neighbour, not
as a number: the list is renumbered by every new answer, but "right after Portal 2" always means the
same thing. Consequences, all intended: new answers keep improving the list without wiping the
hand-made placement; a move whose anchor left the category is not lost, it just stops applying until
the anchor is back; where a move disagrees with the comparisons the move wins, but the line is marked
as placed by hand and is never passed off as a result of the sorting.

---

## Privacy

No server, no backend, no analytics, no cookies, no tokens. Everything lives in the browser's
`localStorage`. **The single outbound request in the whole lifetime of the application is loading the
cover images from the public Steam CDN**, and a switch in the header turns it off — with covers off,
the application makes no outside request at all. The same holds for the GitHub Pages demo: identical
static files, your data stays in your browser.

The userscripts make no network requests whatsoever (`@grant none`, no `@connect`) and read no
cookies, session ids or other secrets.

---

## Limitations

- **The order is not written back into Steam automatically.** The only supported way to set a custom
  order is dragging rows by hand, and committing a drag takes a request carrying the logged-in user's
  `sessionid`. This project will not read a session token or send write requests to Steam on your
  behalf — and a script simulating two hundred drags against a virtualized list would break somewhere
  in the middle and leave the wishlist in a state nobody asked for. So
  [`steam-wishlist-import-order.user.js`](userscripts/steam-wishlist-import-order.user.js) stays in
  preview mode: it matches the file against the page by app id, reports what was found, missing or
  duplicated, badges every row with its target position, and never presses save.
- **Steam selectors will break eventually.** Everything layout-dependent lives in one `STEAM` adapter
  object at the top of each userscript, with a comment explaining how to update it; every field is a
  list of candidates tried in order, and the last-resort route is structural (links to `/app/<id>/`).
  The object is duplicated in both scripts — a userscript is a standalone file and cannot share a
  module — so both need updating.
- **The item kind is not always known.** Without an explicit "DLC" marker on the page the kind stays
  `unknown` rather than being guessed.
- **One browser, one state.** There is no sync between machines — that would need a server. Moving
  means exporting the state file and loading it on the other side.

## License

[MIT](LICENSE)
