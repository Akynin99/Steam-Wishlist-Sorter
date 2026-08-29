# Steam Wishlist Sorter

[![tests](https://github.com/Akynin99/Steam-Wishlist-Sorter/actions/workflows/test.yml/badge.svg)](https://github.com/Akynin99/Steam-Wishlist-Sorter/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A local web application that turns a 200+ entry Steam wishlist into an honestly ordered list —
through pairwise comparisons, with no backend and with your list staying on your own machine.**

🎮 [Live demo](https://akynin99.github.io/Steam-Wishlist-Sorter/)
(the demo set is already inside, you do not have to load a wishlist of your own)

![The wishlist screen](docs/screenshots/import.png)

The interface is bilingual: **English by default, Russian as the second language**, switched in the
header. Nothing is lost when the language changes — not one answer and not the place in the sorting.
It also comes in two looks — the one above and one built out of the store's own blue-grey — switched
in the same place; see [Two looks](#two-looks).

---

## Why this exists

A wishlist grows for years, and the question is always the same: **what do I buy right now?**
Steam sorts it by price, by discount and by the date it was added — by everything except how much
you actually want to play the thing. Steam does have a manual order, but arranging two hundred
entries by dragging is impossible: to put a game in its place you have to hold the whole list in
your head.

The obvious answer — "rate every game from 1 to 10" — does not work, for three reasons:

- **ratings drift.** The first twenty entries get eights and nines, by the hundredth the bar has
  moved, and the ratings from the top and from the bottom of the list are no longer comparable;
- **the scale clumps.** Over 200 entries and 10 steps, every step holds a couple of dozen games,
  and inside a step there is no order at all — which means the problem is not solved;
- **an absolute rating is a hard question.** "How much do I want Hades, out of ten?" asks you to
  keep the rest of the list in mind.

A pairwise question is one a human answers fast and confidently: **"Hades or Hollow Knight?"**
No scale is needed, no context, and the answer does not drift over time. A thousand answers like
that produce an order no ten-point scale can give you.

The rest is arithmetic. Comparing everything with everything over 200 entries is 19,900 questions,
and nobody gets through that. The application asks about a thousand: the list is first split coarsely
into six buckets of desire, and inside a bucket a binary insertion runs on top of a preference graph
that derives everything already implied by the answers given (see [Architecture](#architecture)).

| The categories screen | The comparisons screen | The final list |
| --- | --- | --- |
| ![Categories](docs/screenshots/categorize.png) | ![Comparisons](docs/screenshots/compare.png) | ![Result](docs/screenshots/results.png) |

---

## Live demo

<https://akynin99.github.io/Steam-Wishlist-Sorter/>

It is the same application, published as static files through GitHub Pages. Press **“Try with 20
games”** on the wishlist screen — a set of 20 games is inside, enough to walk all three stages, and
no wishlist of your own is needed for that. The automatic import needs a server and there is none
there, so the screen does not offer the form at all: it offers the two ways in that do work — the
userscript, which reads the Steam page you are logged into, and a link to download the local
version.

> **Your data stays in your browser.** The demo is a static page: it has no backend, so there is
> nothing to send your work with and nowhere to send it. Everything you import lives in the
> `localStorage` of your browser and disappears with the “Start over” button or along with the site
> data. The details are in [Privacy](#privacy).

For regular work on your own list it is better to run the application locally: the same files, but
the state then lives in the `localStorage` of a local address and does not mix with the demo.

---

## Running it

ES modules do not load over the `file://` scheme, so the application is opened from an HTTP address.
The server ships with the project — `server.js`, plain Node, without a single dependency.

**Windows:**

1. Install [Node.js](https://nodejs.org/) 20 or newer (development happens on 24 LTS).
2. Run `start.bat` with a double click.
3. The browser opens <http://localhost:8080/> by itself. If it does not, type the address by hand.

Another port: `start.bat 9000`. If Node is not installed, `start.bat` tries to bring up the built-in
Python server on the same port, and if that is missing too, it says so honestly instead of flashing
a black window.

**Any other system:**

```bash
node server.js
```

and open <http://localhost:8080/>.

Running it locally is also what unlocks the import straight from a Steam account: it needs a server
of its own, and the demo page has none — see
[Straight from your Steam account](#straight-from-your-steam-account).

**Tests:**

```bash
node --test
```

Neither `npm install` nor `npx` is needed: the project has no third-party dependencies and never
will, and the tests are written on the built-in `node:test` and `node:assert`. GitHub Actions runs
the same tests on every push and pull request.

---

## Language of the interface

The switch sits in the header, next to the **⋯** button that opens the settings. **English is the
default, always** — the browser language is deliberately not consulted, so the demo opens the same
way for every visitor. The choice is stored next to the other settings and survives a reload; a
state file saved before the interface became bilingual reads as English.

Switching the language redraws the screens and touches nothing else: the answers, the categories,
the manual moves and the exact place in the sorting stay where they were. The exports follow the
language too — see [What comes out](#what-comes-out).

---

## Two looks

The **⋯** menu in the header holds a second setting of the same kind: which of two themes the
application wears. It is stored, it survives a reload, and it changes nothing but the look — not a
single answer, not a single position.

- **Modern** — the look the application has always had: a near-black page and a turquoise accent of
  its own, so that it never passes itself off as a part of the store.
- **Steam-like** — the blue-grey mood of the store, built out of our own values. No logo, no store
  image, no external asset: it is a set of colours and shapes, not a copy.

![The result screen in the Steam-like theme](docs/screenshots/steam-theme.png)

The two differ in more than hue. Corners, borders, density, the case and the weight of the headings
all move with the theme, because a theme that only repaints is the first theme in another colour.
Everything a theme may want to change is a custom property in `:root`, and `[data-theme="steam"]`
restates only what it disagrees with — which is also why no rule below that block is allowed to name
a raw colour.

---

## Getting the wishlist into the application

Three ways in, from the simplest to the most stubborn: straight from your account, with the
userscript, or from a JSON file you got out of Steam by hand. They all end on the same wishlist
screen, and they mix freely — a repeated import matches entries by App ID and keeps the work already
done.

### Straight from your Steam account

**The card on the wishlist screen. It works when you run the application yourself; on the demo page
it is not offered.** Paste a link to your profile — or type your SteamID64 or the name of your
profile — and press **“Check and load”**. All four of these are understood:

```
76561198093652313
RogerBulletDodger
https://steamcommunity.com/id/RogerBulletDodger/
https://steamcommunity.com/profiles/76561198093652313/
```

The page asks its own local server, and the server asks Steam, in three steps: a profile name is
resolved to a SteamID64 through the public XML view of the profile (no API key is involved
anywhere), the list itself comes from `IWishlistService/GetWishlist`, and then the titles and the
types are fetched from `store.steampowered.com/api/appdetails` — **one App ID per request**. Steam
limits how fast it answers that last one, so the requests go one after another with a pause between
them: 166 entries take about two minutes, with the count of processed entries on the screen and a
**“Stop”** button next to it.

Two things it does for you when it goes wrong:

- **titles are written into the list as they arrive**, not in one lump at the end. Stopping, closing
  the tab, or a Steam that stops answering, all keep everything collected up to that moment;
- **an entry whose title did not arrive is not lost.** It stays in the list as `App 1086940`, with
  its cover and its store link, and the card offers **“Fetch the remaining titles”**, which asks only
  for the ones still missing.

**Why through the local server.** Not one Steam endpoint sends a CORS header, so a page in the
browser is not allowed to read the answer — the request has to be made outside the browser. The path
of the data is “your browser → your own local server → Steam”, and nothing goes anywhere else. A
third-party CORS proxy would mean handing your wishlist to somebody else's server, which is the one
thing this project will not do.

**On the demo page the form is not shown at all**, because it could not work: GitHub Pages serves
static files and has no server behind it, and the application asks about that (`GET /api/health`)
before it draws the card. In its place stand the two routes that do work — **“Import from your Steam
page”**, which is the userscript and works with a private list as well, and **“Run the local
version”**, whose **Download** button is a plain link to the archive of the `master` branch on
GitHub. Both are the full application, not a showcase of one.

**What it can say back**, each with what to do about it: the account was not found; the wishlist is
empty; Steam is limiting the requests; there is no connection. Whatever it says, **the field keeps
what you typed** — the second attempt is made with the same value.

Two of those answers are not a line of text but a state of the card, with the way out inside it: the
steps that open *Game details*, a link to the Steam settings page, a **“Check again”** button that
simply asks for the list once more, and a folded **“I don’t want to make it public”** that explains
the userscript instead. They are told apart because Steam tells them apart:

- **it refused the list** — a `401` or a `403`, and the privacy setting is the reason. Open Steam →
  your profile → *Edit profile* → *Privacy settings* and set *Game details* to *Public*: the
  wishlist follows that one setting.
- **it could not hand the list over** — a `5xx`, which is what Steam answers to a closed list *and*
  what it answers when it is having trouble of its own. The card names both and does not pick one:
  if the setting is private the steps open it, and if it is public already the thing to do is wait a
  few minutes and press **“Check again”**.

**The endpoint takes an account, never an address.** A local server that forwarded arbitrary URLs
would be an open proxy into the home network of whoever runs it, so: the hosts are a closed list of
three (`api.steampowered.com`, `store.steampowered.com`, `steamcommunity.com`), every address is
built in code out of a value that was validated first — seventeen digits for a SteamID64, the Steam
character set for a profile name — redirects are re-checked against the same list instead of being
followed blindly, and the API answers requests addressed to `localhost` only. The tests run a server
that must never be called and check that it never is.

### The userscript

The repository holds two userscripts. The first one is the one that exports the list — it reads the
wishlist page you are logged into, so it works whatever the privacy settings say.

#### Step 1. Install Tampermonkey

[Tampermonkey](https://www.tampermonkey.net/) is an extension that runs user scripts on pages. It
exists for Chrome, Edge, Firefox and Opera. Violentmonkey does the job as well.

In Chrome and Edge you have to turn on developer mode in `chrome://extensions`
(`edge://extensions`) once — without it the extension cannot execute userscripts.

#### Step 2. Install the script

Open [`userscripts/steam-wishlist-export.user.js`](userscripts/steam-wishlist-export.user.js) and
press **Raw** — Tampermonkey offers the installation itself. Or copy the contents of the file and
paste them into the Tampermonkey editor (“Create a new script”).

#### Step 3. Collect the list

1. Open your wishlist: <https://store.steampowered.com/wishlist/>
   (Steam redirects to `/wishlist/profiles/<your SteamID64>/`, or to `/wishlist/id/<your custom
   url>/` if you have one — both work).
2. A **“Wishlist Sorter — export”** panel appears in the bottom right corner. Press
   **“Collect the list”**.
3. The page starts scrolling by itself — that is how Steam loads the entries, only about sixteen of
   them are in the markup at once. Do not touch it while the collection runs. Two hundred entries
   take about a minute.
4. The script shows a report: how many entries were collected, how many scroll steps it took, how
   the scrolling element was found, and — the line to read first — **whether that is the whole
   wishlist**. The rows of the page are numbered, so the script knows how many there should be. If
   fewer were read, it says so and holds the file back. Press **“Download JSON”**.

#### Step 4. Load the file into the application

On the wishlist screen, open **“Other import methods”** and pick the downloaded file under
**“JSON file”**. That is it, the categories are next.

Importing again **does not erase the work**: entries are matched by App ID, the categories and the
comparison answers are kept, and only the titles, the covers and the wishlist positions are
refreshed. So a month later you can export the list again and continue from the same place.

#### What the script does and does not do

- it collects the App ID, the title, the link, the cover URL, the current position in the wishlist
  and the type (game / DLC / `unknown` when the page carries no mark — the type is never guessed);
- it **makes no network request at all**: no `fetch`, no `XMLHttpRequest`; the header says
  `@grant none` and there is not a single `@connect`;
- it does not read cookies, and does not touch `sessionid`, tokens or any other secret;
- when the Steam selectors do not match, it shows a readable message and stops. An empty or
  knowingly incomplete file is never handed over silently: the script counts the rows the page
  numbers, compares that with what it read, and puts the answer at the top of the report. A list
  read in part is offered only after you tick a box saying you want it anyway, and the file is then
  named `…-partial.json`. See [Updating the selectors](#updating-the-selectors).

---

## When the userscript stops working

Steam changes the layout of the wishlist, and one day the selectors will break. The list can still
be obtained — the application accepts several JSON shapes.

### Way 1. The public wishlist endpoint

Open it in the browser directly, with your own SteamID64:

```
https://api.steampowered.com/IWishlistService/GetWishlist/v1?steamid=76561198000000000
```

The browser shows JSON. Save the page as a file (`Ctrl+S`) and load the file into the application.

There is also an older endpoint with richer data — titles and covers right there in the answer; in
places it no longer responds, but when it does, the application understands its format as well:

```
https://store.steampowered.com/wishlist/profiles/76561198000000000/wishlistdata/?p=0
```

Two caveats, both important:

- **the wishlist has to be public** in the privacy settings of the Steam profile, otherwise the
  endpoint returns nothing;
- **the page in the browser cannot fetch that address itself** — CORS. Steam does not give our
  page the header that would let it read another domain, and working around that through a proxy
  would mean sending your wishlist to somebody else's server. Locally the application solves it
  honestly, by asking its own server (see
  [Straight from your Steam account](#straight-from-your-steam-account)); with no local server, it
  goes through a file: open, save, load.

The new endpoint returns **App IDs and priorities only**, without titles. That is fine: the
application shows such entries as `App 1086940`, builds the store link itself and takes the cover
from the public URL of the Steam CDN — you recognize the game by its picture. And if you later
export the list with the userscript and import it on top, the titles land on the same entries and
nothing is lost.

### Way 2. Paste the JSON as text

**“Other import methods”** on the wishlist screen has a **“Paste JSON”** field — the body of the answer can go there without saving
a file. Understood are: an array of objects, an array of bare App IDs, an object shaped like
`{ "440": { … } }`, `{ response: { items: [...] } }` and the application's own export.

Everything that could not be read lands in the import report with a reason — an import does not
fail as a whole because of one malformed record.

### Way 3. Update the selectors

See [Updating the selectors](#updating-the-selectors) — it is one object at the top of each script,
and the scripts are written so that it rarely has to be touched at all.

---

## Updating the selectors

Everything that knows what the Steam markup looks like lives in one object, `STEAM`, at the top of
[`steam-wishlist-export.user.js`](userscripts/steam-wishlist-export.user.js). **The same object is
duplicated in the second userscript** and both files have to be updated: a userscript is loaded by
Tampermonkey as a file of its own, and there is nowhere to pull a shared module in from. The rest of
each script speaks of “a row”, “a title”, “an app id”, and knows no class name.

### What the page looks like now, and what is worth holding on to

Steam rewrote the wishlist. Three things about the new page matter here:

- **the list is virtualized.** About sixteen rows are in the markup at any moment, whether the
  wishlist holds twenty entries or two hundred. The rest exist only as the page is scrolled to them;
- **the class names are generated.** They look like `S2Q8eqrNOA4-`, they are produced by the build
  of the page, and they change without anyone at Valve deciding anything. `data-app-id`,
  `id="wishlist_row_…"` and every class with the word *wishlist* in it are gone;
- **the scrolling happens in `#StoreTemplate`,** not in the window. The window does not scroll at
  all — so a script that scrolls the window scrolls nothing, loads nothing, and has no way of
  noticing.

The anchor the scripts hold on to is the attribute **`data-rfd-draggable-id`**, whose value looks
like `WishlistItem-294100-0`: the App ID of the game and the number of the row *in the whole list*.

It is a better anchor than any class name for a reason worth stating plainly. The attribute is put
there by the drag and drop library the wishlist is built on — `rfd` is `react-beautiful-dnd` and its
successors — and it is not decoration: dragging a row does not work without it. So it lives exactly
as long as the ability to drag rows with the mouse lives, and that ability is the very thing this
project writes an order through. The day the attribute disappears, the dragging behind it has been
rebuilt — and the undocumented endpoint the second script posts to is then just as likely to have
moved, which makes the selectors the smaller half of that day's problem. A class name promises
nothing of the kind: it changes when somebody rebuilds the page, and nothing on the page breaks.

The number in it earns its keep twice over. It gives the order of the list without measuring
anything — under virtualization a row's coordinate says where it sits among the sixteen rendered
right now, and nothing about where it sits among a hundred and sixty six — and it says how long the
list is, which is what the completeness check below is built on.

### The script finds the scrolling element itself

`STEAM.scrollers` still lists names, `#StoreTemplate` first, but the list is a hint and no longer the
only path. A candidate is taken only if it really is taller inside than out **and** really holds the
rows: an element that scrolls but has no wishlist in it — a sidebar, a panel of recently viewed
games — is passed over rather than scrolled uselessly.

When no name fits, the script measures instead: it takes a row, walks up its ancestors and takes the
first one whose content is taller than its box. That path needs no name of Steam's, and it is meant
to survive the next redesign without anybody editing this repository.

### It checks that it read the whole list, and says so when it did not

This is the part that matters most, and it exists because of a real failure. After the rewrite the
scripts scrolled the window — which does not scroll — and saw only the rows the page had rendered on
its own: **14 of 166.** Nothing about that looks like an error. A list of fourteen games is a
perfectly plausible list of fourteen games, and the second script offered to write it into Steam.
Writing those fourteen would have put them at the top and left the other hundred and fifty two to
land wherever Steam decided — a place nobody chose and no report could have named.

So the reading is now judged before its result is used anywhere:

- the highest row number the page ever showed, plus one, is how many entries the wishlist holds;
- every number from `0` to that maximum has to have been read. A gap is a row that was never seen;
- the scrolling has to have reached the bottom, not run out of time and not been stopped by hand. A
  numbering read off a page that was never scrolled describes the window, not the wishlist — which
  is exactly the shape of the failure above, and why the numbering alone is not enough;
- the export script states the verdict in the panel in words. A list read in part is not offered as
  a file until you tick a box saying you want it anyway, and the file is then named `…-partial.json`;
- **the second script does not offer the write at all.** No checkbox, no “anyway”. There is no
  reading under which sending a partial order would be right.

The older layout numbers no rows. There the scripts fall back to the coordinates, as before, and say
in the panel that nothing but having reached the bottom vouches for the list — which is the truth
about that page.

### If it breaks anyway

1. open the wishlist, right-click a row with a game → **Inspect**;
2. find the element that wraps the whole row (cover + title) and put its selector first in `rows`;
3. check that the title, the cover and the link inside it are still found by `titles`, `images` and
   `appLink`, and add selectors if they are not;
4. if the numbering attribute has been renamed, `draggableId` and `draggableIdPattern` are the two
   fields to change. The pattern matches *some* name in front of the App ID rather than
   `WishlistItem` itself, so a rename alone does not break it;
5. reload and press **“Collect the list”**. The report says how many rows were found, by which
   route, and how the scrolling element was worked out.

Every field is a list of candidates tried in order, so the old values stay where they are — a user
still served the old page keeps working. The last line of defence is the fallback parsing by
`/app/<id>/` links, which survives almost any change of class names.

All of it is under test on a mock of the markup — both layouts, in
[`tests/helpers/wishlist-page.js`](tests/helpers/wishlist-page.js) — including the incomplete
reading and the search for the scrolling element when no known name matches. The tests never touch
the network or a live Steam page.

---

## How to use it

1. **Wishlist.** The list comes in: straight from your Steam account, from a file or from text
   under **“Other import methods”**, or as the demo set behind **“Try with 20 games”**.
2. **Categories.** One game at a time on a scale of five levels of interest — from “Really want
   it” to “Barely interested”. The sixth value, “Remove from the wishlist”, stands apart from that
   scale: it says nothing about how much a game is wanted. Keys `1`–`6`, `←` for back, `→` or
   space to postpone. The stage can be skipped — the item is **“Skip the categories”** in the
   settings menu, and it asks first, because the comparisons then run over the whole list as one
   group. With categories there are noticeably fewer questions: an entry from “Really want it” is
   never compared with an entry from “Unlikely”.
3. **Comparisons.** One question, two games, and one line saying where the work stands: which
   category is being sorted, how many comparisons are made and roughly how many are left. The
   answers are “this one”, “that one”, **“about the same”** (a tie) and **“cannot decide”** (the
   pair is postponed, it comes back later — and often it does not have to, because the order follows
   from other answers). The last answer can be undone. **“Finish for today”** ends the session and
   opens the result; nothing is lost by pressing it. Both this stage and the one before it explain
   themselves once, the first time they are opened, and never again.
4. **Result.** Four blocks, in the order the work ends in: what came of it, the transfer into
   Steam, the numbered list with its search, its filters and its draggable rows, and the files
   under **“Download or share”**. The technical account of the order is folded away under
   **“How was this order built?”**, and the two resets stay at the foot of the screen, next to the
   list they change. A row is moved with the mouse or, without one, by walking the list with
   <kbd>↑</kbd> / <kbd>↓</kbd> and moving the row under the cursor with <kbd>Ctrl</kbd> +
   <kbd>↑</kbd> / <kbd>Ctrl</kbd> + <kbd>↓</kbd>.
5. **Back into Steam**, if you want the order there and not only in a file: the transfer card stands
   above the list, because that is what the whole thing is for — drag the link onto the bookmarks
   bar, or copy it, and press the bookmark on your wishlist page. See
   [Carrying the order back into Steam](#carrying-the-order-back-into-steam).

The whole of it is reachable from the keyboard, from the header to the last row of the result, and
the hotkeys stay quiet while you are typing in a field or while a menu or a dialog stands over the
page. Nothing is said in colour alone: a row of the result carries its state in words as well as in
the style of its border, the category a game is filed under carries a tick, and a stage that is done
carries one instead of its number.

### The sorting can be abandoned halfway

That is by design, not something that “happens to work”. A thousand comparisons are not done in one
sitting, and a tool that gives nothing until the very end is useless.

The “Result” screen is available from the first minute and always gives a meaningful list:
everything that already follows from the answers stands in the derived order, and the rest stands in
the fallback one, by the position in your wishlist. Every row is marked with where its place comes
from:

- **confirmed by comparisons** — the order with both neighbours follows from your answers;
- **still in the old order** — the comparisons have not reached this row yet;
- **moved by hand** — you dragged the row here yourself;
- **tied with the row above** — one of your answers said the two are wanted equally.

The summary on top says honestly which part of the list is already ordered and which part simply
stands by seniority: a ring with the share the answers carry, the count beside it, and the numbers
behind it — the answers made, the moves made by hand, the fallback order — under
**“How was this order built?”**.

### Where the state lives and how to back it up

The state is written into the `localStorage` of the browser under the key
`steam-wishlist-sorter/state` after every action. Close the tab, turn the computer off, come back a
week later — the application opens where you left it and offers the same question.

Two smaller things live beside it under keys of their own: the screen you were last on, and
whether the explanation of a stage has already been shown. Neither belongs to the wishlist, so
neither travels inside a state file — and **“Start over”** does not bring the explanations back,
because the person in front of the screen is the same one and has already read them.

What matters about `localStorage`: it is tied to **the browser and the address**
(`http://localhost:8080` and the demo on GitHub Pages are different stores), it lives on one machine
and it is erased along with the site data. That is why the settings menu has a **“Save backup”**
item (and its twin, “Backup of the state”, on the result screen): it writes the whole state out —
the list, the categories, the answers, the manual moves — as one JSON.

That file is both a backup and a way to move: on another machine, open the application and load it
through **“Load backup”** in the same menu, or through **“Saved state”** under **“Other import
methods”** on the wishlist screen.
Loading a state replaces the current work whole, so the application asks for a confirmation.

Make a copy before you clear the browser data or change machines: it is the only way not to lose the
comparisons you have made.

---

## What comes out

The **“Download or share”** block at the foot of the “Result” screen, folded away because the order
usually goes into Steam through the link above it and not through a file; see
[Carrying the order back into Steam](#carrying-the-order-back-into-steam).

| Button | What it gives | What for |
| --- | --- | --- |
| **Order as JSON** | `wishlist-order-YYYY-MM-DD.json` | the machine readable order: position, App ID, category, place in the category, where the order comes from, the ties and a separate “remove” list. The second userscript reads it |
| **List as CSV** | `wishlist-order-YYYY-MM-DD.csv` | a table for Excel, Google Sheets, LibreOffice |
| **Copy as a list** | text on the clipboard | a numbered list — to drop into a note or into a chat with a friend |
| **Backup of the state** | the full state dump | to continue the work on another machine |

The files a human reads follow the language of the interface: the CSV header, the category names and
the type of every entry are written in it, and so is the `categoryLabel` field of the JSON. The ids
never move — `category`, `origin` and `kind` stay the machine readable values they always were, so
a file exported in one language is read by the second userscript exactly like a file exported in the
other.

### Why the CSV separator follows the language

In English the separator is a **comma**, exactly as
[RFC 4180](https://datatracker.ietf.org/doc/html/rfc4180) asks for. In Russian it is a
**semicolon** — a deliberate departure from the standard, and for a concrete reason: when Excel
opens a `.csv` on a double click, it does not read the file by the RFC, it splits it by the **list
separator of the system locale**, and in the Russian (as well as the German and the French) locale
of Windows that is a semicolon. A comma separated file opens there as one single column, and the
user goes off to fight with the import wizard — which means the table the whole thing was for did
not open.

Every other tool — LibreOffice, Google Sheets, `pandas`, the `csv` module of the standard library —
takes the separator as a parameter, and for them this is one extra argument. So the compromise is
made in favour of Excel on the user's own locale, and it is a compromise, not conformance.

For the same reason there is a BOM at the start of the file: without it Excel reads a `.csv` in the
system ANSI code page and every non-Latin title turns into mojibake.

---

## Carrying the order back into Steam

The final order can be written straight into your Steam wishlist. There are two ways to do it, and
they send the very same request — what differs is how much they do around it.

**The bookmarklet** is the short way, and the one to start with. The application builds a link that
already holds your order; you drag it onto the bookmarks bar and press it on the Steam wishlist
page. No extension, no developer mode, nothing to install.

**The userscript** —
[`userscripts/steam-wishlist-import-order.user.js`](userscripts/steam-wishlist-import-order.user.js)
— is the long way, for when you want a backup of the current order and a check afterwards. It reads
the page, so it can do both; it also needs Tampermonkey and it depends on Steam's layout.

### The short way: the bookmarklet

On the **Result** screen, above the list, stands the card the whole screen is about: **“Transfer
the order to Steam”**, in three steps.

1. Show the bookmarks bar: <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>, or <kbd>⌘</kbd> +
   <kbd>Shift</kbd> + <kbd>B</kbd> on a Mac — in Chrome, Edge and Firefox; in Safari it is the
   “View” menu. The card names the one for your platform, and it does not guess the browser.
2. Drag the link onto the bar. Do not click it on the application's own page — a click there is
   caught and answered with a reminder to drag it instead. If dragging with a mouse is not an
   option, **“Copy link”** puts the same address on the clipboard, to be pasted into a bookmark
   made by hand.
3. Open [your Steam wishlist](https://store.steampowered.com/wishlist/) and press the bookmark.

On a phone or a tablet the card says outright that the transfer is easier in a desktop browser: a
bookmarklet has to be dragged onto a bookmarks bar, and there is none.

The order lives inside the address of the link. That is the whole idea: because the order is already
in there, the bookmarklet has no reason to read the Steam page — no scrolling to the end of a
virtualized list, no row selectors, no checking that the reading was complete. Everything that
breaks when Steam changes its layout is simply not there. What is left is the write endpoint, which
is the one thing that was measured on a live account.

The link is rebuilt on every change of the order, so the one on the screen is always the current
one. If you move a row after taking the link, the card says so — **“the order has changed”** — and
asks you to drag the new link over the old bookmark, because the one already on the bar holds the
order of the moment it was taken. It can only say that about a link it saw you take: a bookmark on
the bar is a copy the page cannot reach, so “the bookmark is installed” is never claimed.

It speaks the language the interface was in when it was built, and it holds nothing but the code,
the app ids and those texts: no titles, no links, no tokens, and no address of the local server.
Twenty items make a link of about seven kilobytes.

### What the bookmarklet does when you press it

1. **It checks where it is.** Not `store.steampowered.com/wishlist/…` — it says where to go and
   sends nothing.
2. **It asks.** A panel in the corner of the page names the number of entries, says that nothing
   will be deleted, and states the one thing no backup undoes — see
   [What the write cannot undo](#what-the-write-cannot-undo). Nothing has been sent yet.
3. **It sends one request** — the one the page itself sends when a row is dragged:

   ```
   POST https://store.steampowered.com/wishlist/action
   Content-Type: application/json; charset=utf-8
   X-Valve-Request-Type: mutationAction
   { "m": "Reorder", "mp": [ [ { "appid": 1509510, "priority": 1 }, … ] ] }
   ```

   `mp` is an array of one element, and that element is the list of pairs; the double brackets are
   not a typo. `X-Valve-Request-Type` is not decoration either: the same request without it comes
   back `400` with an empty body, and with it `200`. It is what marks the request as coming from
   Steam's own page — another site can make your browser send a POST with your cookie on it, but it
   cannot add a header. Steam answers `{ "data": { "result": 1 } }`.
4. **It says what came back**, in the same panel: accepted, refused with a result of its own,
   refused at the door with a `400`, session expired, too many requests, list too large, or the
   network never let the request out. Each case in its own words, and the panel closes on a button.
5. **It asks you to reload the wishlist and look at the order.** It does not read the page, so the
   check is yours — and it says so instead of implying it checked.

Nothing in the request is a secret of yours, because none is needed: the address is Steam's own
origin, so the browser attaches the cookie of the account it is signed in as, and the code never
sees it. The app ids in the link are public numbers.

### What the bookmarklet cannot do

- **It makes no backup.** Reading the current order means reading the page, and reading the page is
  exactly what it does not do. If you want the order you have now saved to a file first, use the
  userscript — and see [How to undo a write](#how-to-undo-a-write).
- **It checks nothing afterwards.** Same reason. It asks you to look.
- **It carries the list you had when the link was built.** Anything added to the wishlist after that
  is not in the request, and stays at the end without a priority. Import the wishlist again, sort
  the new entries in and drag a fresh link over.
- **It is one request, so a very large wishlist may not fit.** Steam answers `413`, the panel says
  so, and nothing is written. That list needs the userscript, which can mark the rows on the page
  instead — see [What remains a limitation](#what-remains-a-limitation).

### The long way: the userscript

[`userscripts/steam-wishlist-import-order.user.js`](userscripts/steam-wishlist-import-order.user.js)
takes the “Order as JSON” file and writes that order into the wishlist, with a report before and a
check after. It is installed the same way as the export userscript — see
[The userscript](#the-userscript). Then: open the wishlist → the panel in the bottom right corner →
pick the file.

1. **The file is read and checked.** It has to be the order file: the `kind` field is what tells it
   from a state dump, and a state dump is refused with a note saying which export is needed. The
   backup this script writes is a file of the very same kind, so it is accepted as well.
2. **The page is read, and the reading is checked.** The script scrolls the wishlist to the end so
   that every row loads, and collects the App IDs in the order the page numbers them — not in the
   order of their coordinates, which under a virtualized list describe only the handful of rows
   rendered at that moment. Then it checks itself: the highest row number the page showed says how
   long the list is, and if fewer entries were read than that, **the script says so and offers no
   write at all.** There is no checkbox for it. An order built on half a page is not half an order:
   the entries that were never read would be missing from the request, and where they end up would
   then be Steam's business rather than yours. See [Updating the selectors](#updating-the-selectors).
3. **A report is shown, and nothing has been written yet.** How many entries of the file were found
   on the page and how many were not (the missing ones are usually already bought), whether the page
   holds duplicates, which entries appeared after the export, how many are marked for removal, and
   the whole target order — a line can be clicked, and the page scrolls to that game.
4. **The backup.** One button downloads the order the wishlist is in *right now*, as a file in this
   very format. The write button stays out of reach until you take the backup or tick the checkbox
   saying you do not want one.
5. **The confirmation.** The write button opens a second, separate confirmation that names the
   number of entries, the fact that the write goes to the account this browser is signed in as, and
   the one consequence a backup cannot undo — see
   [What the write cannot undo](#what-the-write-cannot-undo). Only that one sends anything.
6. **The request.** The same one the bookmarklet sends, and the answer is read out into one case
   with one message: accepted, refused with a result of its own, refused at the door with a `400`,
   session expired, list too large, too many requests, not JSON at all, or the network never let the
   request out.
7. **The check.** The wishlist page does not redraw itself after the write, so the script offers to
   reload it, reads the order again and compares it with what was sent, entry by entry. A difference
   is shown as it is — how many entries stand as asked, where the first difference is, what left the
   list and what appeared in it. It is not swallowed.

### What neither of them will do

- **They delete nothing.** The entries you put into “remove from the wishlist” are pushed to the end
  of the order and listed in the panel, so that you take them off yourself. A deletion cannot be
  undone, and the price of a mistake by a script is too high here.
- **They lose nothing.** The request always carries the whole list: every place is then stated
  outright, and none is left for Steam to decide. In the userscript that includes the entries which
  are on the page but not in the file — added after the export, or left out of the ranking — which
  keep their place relative to one another and are appended after the ordered part.
- **The userscript does not write what it did not read.** A wishlist it read only in part gives no
  report, no plan and no write button — only the count it got, the count the page promised, and what
  to do about it. The bookmarklet reads nothing, so the question does not arise: it writes the order
  the application handed it.
- **They touch no secret of yours, because they need none.** There is no `sessionid` and no
  `access_token` in the body: the address is the origin the page was loaded from, so the browser
  attaches the cookie of the signed-in account itself, and neither of them ever sees it. They read
  no cookies and send nothing to the local server of the application.

### How to undo a write

Pick a backup file with the userscript and write it back. The backup is an ordinary order file, and
the script that wrote your order is the script that puts the old one back.

The bookmarklet has no part in this: it never made a backup, because it never read the order that
was there. If undoing matters to you, take the backup with the userscript before the first write —
after it, the order that was there is gone from everywhere except that file.

### What the write cannot undo

Steam keeps a `priority` on every wishlist entry: a straight numbering, from one upwards, of the
entries you have arranged by hand. Entries you have never arranged sit at the end with `priority: 0`
and no number at all. On the account this was read off, 166 entries were 76 with the priorities
1…76 and 90 with a zero.

Both ways send the list **whole**, numbered `1…N`. So after the write **every** entry has a
priority, including the ones that had none before.
A backup puts the order back; it cannot put back “never arranged”. Both say so before anything is
sent: the userscript in the box above the write button and again at the confirmation, the
bookmarklet in the panel it opens on the wishlist page.

### What remains a limitation

- **The endpoint is undocumented and unsupported.** `POST /wishlist/action` with
  `{"m":"Reorder","mp":[[…]]}` is what the page itself sends when a row is dragged; Valve promises
  nothing about it and may change it any day. When that happens, both say what came back instead of
  pretending it worked. The address used before this —
  `/wishlist/profiles/<steamid>/reorder/` with a `sessionid` field — belonged to the previous
  version of the page, and the rewritten one does not use it at all: it puts no `g_sessionID` on the
  page, so that write never even started. What Steam demands of the request can change the same way:
  the `X-Valve-Request-Type` header turned a `400` with an empty body into a `200`, and an answer
  like that names nothing. So a `400` has a message of its own — refused at the door, nothing
  written, compare the headers of a real drag in DevTools with the ones the code sends.
- **The write goes to the account this browser is signed in as, not to the page on the screen.** The
  address names no account — the cookie decides. So opening somebody else's wishlist and running
  either of them would rearrange *your* list. The userscript reads the page for the account it
  belongs to and names it in the report, as a check you can make with your own eyes: seventeen
  digits in the address; `g_steamID`, the variable the old layout defined; a link on the page to
  this wishlist by its numeric address; that address inside an inline script; a `data-steamid`
  attribute. The bookmarklet does not read the page at all, so it names no account: it carries the
  order the application built out of *your* wishlist, and where that order lands is decided by whom
  the browser is signed in as.
- **An account the userscript could not work out is a sentence, not a lock.** Since the request is
  addressed to nobody, there is nothing an unknown account could send astray, and the write is not
  blocked over it — the report says the account is unknown, or that the page names more than one,
  and asks you to look at the list. The single case still refused outright is the certain one: a
  numeric address naming one account while the page says you are signed in as another.
- **A very large wishlist may not fit into one request.** 166 entries make a body of about seven
  kilobytes, so the ceiling is far off — but it is a ceiling. Steam answers `413`, and both say so
  in words. Splitting the list is not a way out either: what Steam does with the entries a piece
  leaves out has never been measured, and a wishlist is a poor place to measure it. For such a list
  the userscript's preview mode is still there: “Show the order on the page” marks every row with
  the number it has to end up at, and the dragging is yours.
- **The userscript's check reads the page.** For it to mean anything the wishlist has to be sorted
  by **Your rank** with the filters cleared, which is also the sorting that shows the order you have
  just written. The panel says so next to every difference it reports. The bookmarklet has no check
  to speak of and asks you to look with your own eyes instead.

---

## Architecture

Vanilla JS, ES modules, no frameworks, no bundler, no transpilation. Node is needed only for the
tests and for the local server. There is not a single third-party dependency, neither at runtime nor
in development.

### Modules

| File | What for |
| --- | --- |
| [`src/model.js`](src/model.js) | the model of an entry (`appId`, title, link, cover, position in the wishlist, type), the six categories, the normalization of anything into that model. It knows about neither the DOM nor the storage |
| [`src/i18n.js`](src/i18n.js) | the two dictionaries and the lookup around them: `t()`, the plural forms, the current language. No DOM either, so it is tested directly — including the test that the sets of keys of the two languages match exactly |
| [`src/import.js`](src/import.js) | bringing arbitrary JSON to the model: five shapes on the input, a report with reasons on the output. Merging by `appId`, so a repeated import breeds no duplicates and erases no work |
| [`src/steam.js`](src/steam.js) | the import straight from an account: what the user typed to a SteamID64, the closed list of hosts every request is checked against, the reading of the Steam answers and the walk over the titles with its pauses and retries. It takes the `fetch` it should use, which is what lets the tests drive all of it without a single real request |
| [`src/storage.js`](src/storage.js) | `localStorage` behind a wrapper: autosave, the export and import of the state as a file, the check of the signature and of the format version. It does not depend on the DOM — a test replaces it with an in-memory stub |
| [`src/ranking.js`](src/ranking.js) | the core: the preference graph, the pair scheduler, the layer of manual moves, the building of the result. All the ranking logic lives here, and the interface does not duplicate it |
| [`src/export.js`](src/export.js) | the result as JSON, CSV and text. No DOM — which is why every format is checked by a test character by character, instead of by eye in a downloaded file |
| [`src/bookmarklet.js`](src/bookmarklet.js) | the link that carries the order into Steam: the app ids in their final order, the interface texts of the moment, and the small program that sends the one write request. No DOM either, so a test can read the address apart character by character and make the generated code run against a fake page |
| [`src/result-view.js`](src/result-view.js) | what the result screen decides before it draws anything: the state of a row, the share of the list the answers carry, whether the link taken a minute ago still writes the order on the screen, and whether the bookmarks bar is shown with <kbd>Ctrl</kbd> or with the command key. No DOM, so all four are covered by [`tests/result-view.test.js`](tests/result-view.test.js) |
| [`src/theme.js`](src/theme.js) | the names of the two themes and the rule for reading one back: an unknown value and a state file from before the second theme both read as Modern. It touches neither the DOM nor the storage, so a test gets at it directly |
| [`src/onboarding.js`](src/onboarding.js) | which stages have already explained themselves. It is not application state — it says something about the person, not about the wishlist — so it lives under a key of its own and “Start over” does not bring the explanations back |
| [`src/ui-*.js`](src/) | the screens on top of the core: wishlist, categories, comparisons, result, the card of the direct import, the shared frame with its stage sequence and settings menu, and the dialogs |
| [`server.js`](server.js) | a server on plain Node: it serves the files of the project, is guarded against escaping the root, and answers the three endpoints of the direct import — the health check the card asks about, the wishlist and the missing titles |
| [`userscripts/`](userscripts/) | two Tampermonkey scripts: the wishlist export and the writing of the order back into Steam. The half of the second one that decides what gets sent and what an answer means is loaded by `node --test` and covered by [`tests/reorder-userscript.test.js`](tests/reorder-userscript.test.js) |

### The algorithm: a preference graph, not a merge sort

The obvious move is to take a ready merge sort and put a question to the user into the comparator.
That must not be done, and here is why.

A merge sort **has to know the outcome of the current comparison** to continue merging. And the
application needs two answers a comparator never has:

- **“about the same”** — that is not “less”, not “greater” and not “equal” in the sense of sorting:
  the order that comes out is non-strict, with groups of equal elements;
- **“cannot decide”** — the pair has to be postponed and the work has to **go on**, while a merge
  sort simply stalls at that point.

Plus two practical requirements: undoing the last answer, and removing an entry from the list in the
middle of the process. For a merge sort both mean starting over.

So the source of truth is a **graph**:

- an edge `A → B` means “A is above B”;
- a disjoint-set structure (union-find) holds the groups of entries declared equal;
- the transitive closure is kept as bit masks of ancestors and descendants, so “what do we already
  know about this pair” is a constant time lookup — and the scheduler asks that thousands of times
  per session.

Everything needed follows from the graph by itself: transitivity (a pair implied by the answers
already given is never asked about), undo (an answer is thrown away and the history is replayed),
the removal of an entry (a node disappears), the ties (nodes merge into one group).

On top of the graph runs the **scheduler** — a binary insertion, separately in every category: the
entries already placed form a chain, the next entry is inserted into it by binary search, and every
probe is addressed to the graph first. A question reaches the user only for the probe the graph
cannot answer. Hence O(n log n) questions instead of the O(n²) of the naive sweep.

A postponed pair does not stop the scheduler: the entry that needs it is skipped, the next one is
inserted, the chain grows — and most of the time the postponed pair stops being needed at all. If
every remaining question is postponed, the scheduler reports the deadlock and shows the first
postponed pair as unavoidable.

The whole state is the entries, their categories and an **append-only history of actions**. The
graph, the groups, the queue of postponed pairs and the position of the scheduler are derived from
it by a deterministic replay. That is why saving the state loses nothing, and after a reload the
application asks exactly the question it asked before it.

### The manual order as a separate layer

The most interesting decision in the project. A row of the final list can be dragged with the mouse
— and that is not the same thing as an answer to a comparison.

**An answer is a statement about a pair.** It goes into the graph, which is append-only and has to
stay free of contradictions. **A drag is a statement about the list.** It may perfectly well
contradict an answer given ten minutes ago: you are looking at a finished list and seeing what you
could not see while answering a single question.

Sending a drag into the graph would mean either refusing the user their own move or deleting edges
from the graph. Both are worse than keeping the two layers apart. So a manual move is stored as

```js
{ appId, anchor, side }   // "this entry goes right after / before that one"
```

and the moves are replayed **on top of** the order the comparisons produce, in the order they were
made. A place is remembered relative to a neighbour, not as a number: the list is renumbered after
every new answer, while “right after Portal 2” always means the same thing.

The consequences are all intentional:

- new answers keep improving the list, while the manual arrangement is laid over them and is not
  erased by them;
- a move whose anchor has left for another category is not lost — it simply stops applying until the
  anchor comes back, exactly like an answer about a pair that no longer exists;
- where a move argues with the comparisons, the move wins, but the row is marked “moved by hand” and
  is not passed off as a result of the sorting;
- the scheduler is unaffected: it goes on asking the same questions, because a drag never claimed to
  answer one of them.

The manual edits are reset by a button of their own, without touching the comparison answers.

---

## Privacy

- Nothing is sent anywhere: **no backend, no analytics, no cookies, no tokens.** `server.js` hands
  the files of the application to the browser, and does one thing besides that: **on your direct
  request — the button of the import card — it asks Steam for the wishlist of the account you
  named.** It goes to Steam and to nobody else, only when the button is pressed, and only to the
  three Steam hosts hard-coded in the source. Your wishlist comes back the same way and stops in
  your browser.
- The whole state lies in the `localStorage` of your browser, on your machine, and is erased by the
  “Start over” button or by clearing the site data.
- **The only external request the page itself ever makes is loading game covers from the Steam CDN
  over a public URL** — the import above is done by `server.js` on your machine, not by the page.
  Covers are switched off by the “Load covers” toggle in the **⋯** menu of the header; with the
  toggle off and no import running, nothing reaches outside at all.
- **The export userscript makes no network requests whatsoever**, and the one that carries the order
  back makes exactly one, to Steam itself: the `POST` that writes the order, to the same origin the
  wishlist page was loaded from, after you have confirmed it. Both have `@grant none` and not a
  single `@connect`, so neither can reach any other host. Neither reads your cookies, and neither
  holds a secret of yours: the body of that one request carries the App IDs and their places and
  nothing else — no `sessionid`, no token. The right to write is the cookie the browser attaches by
  itself, because the address is the page's own.
- **The bookmarklet makes that same one request and no other.** It is built by the page you are
  looking at, it runs on the Steam wishlist page you pressed it on, and it goes nowhere except that
  page's own origin — not to `server.js`, not anywhere else. What it carries is the code, the App
  IDs in their order and the interface texts: App IDs are public numbers, and there is no token, no
  `sessionid` and no cookie of yours anywhere in it. It reads no cookies and does not read the page.
  The whole of it can be read in [`src/bookmarklet.js`](src/bookmarklet.js), and the address of the
  link can be pasted into any editor and read there — it is percent encoded text, not a binary.
- The same holds for the demo on GitHub Pages: the very same static files, only on somebody else's
  hosting. Your data stays in your browser — there is nobody to send it to and nothing to send it
  with. The two links that screen offers — **Download** for the archive of the `master` branch, and
  the one that opens the export userscript — are ordinary links to github.com: nothing is requested
  by the page, nothing is sent, and nothing happens at all until you click one yourself.

The wording “no external requests”, without the note about the covers, about the import straight
from an account and about the write the bookmarklet and the userscript perform on request, would be
untrue, which is why it is not here.

---

## Limitations

- **The order is written into Steam through an endpoint nobody documented.** The bookmarklet and the
  second userscript send what the wishlist page itself sends when a row is dragged, and Valve
  promises nothing about it: it may change any day, and then both will report what came back instead
  of pretending it worked. A very large wishlist can also fail to fit into one request — Steam
  answers `413`, and the userscript's preview mode with the marks on the rows is what is left. And one part of the write is undone by
  nothing: after it every entry carries a priority number, including the ones that carried none. In
  detail — in [“What the write cannot undo”](#what-the-write-cannot-undo) and
  [“What remains a limitation”](#what-remains-a-limitation).
- **The Steam selectors will break one day.** The layout of the wishlist has changed more than once,
  and the class names of the current page change by themselves — they look like `S2Q8eqrNOA4-` and
  are minted by whatever built the page that day. When the reading breaks, the script says so and
  stops; it will not hand over a silently empty file, and the second script will not write. The
  bookmarklet is the exception, and that is the reason it exists: it reads no rows, so there is no
  selector in it to break.

  What to do about it is written out below, in
  [Updating the selectors](#updating-the-selectors).
- **The type of an entry is not always known.** When the page shows no “DLC” mark, the type stays
  `unknown` — the script does not guess it, so that no invented data goes into the file.
- **The public endpoint gives App IDs only.** The application builds the titles and the covers
  itself; the real titles come from the direct import, from the userscript, or from a later import
  on top.
- **The import straight from an account needs a local run**, because the request to Steam has to be
  made outside the browser. On the demo page the card says so instead of offering a dead button. It
  also needs the wishlist to be public, and it takes minutes rather than seconds: Steam hands over
  one title per request and limits how fast it will do even that.
- **One browser, one state.** There is no synchronization between machines and none is planned: that
  would mean a server. Moving happens through the state file.

---

## Repository layout

```
index.html                 the entry point of the application
styles.css                 the styles: two dark themes over one set of markup
server.js                  the local server on plain Node: the files, and the /api/* endpoints
start.bat                  the launcher for Windows (Node, with Python as a fallback)
src/                       the source: model, i18n, import, steam, storage, ranking, export,
                           bookmarklet, result-view, theme, onboarding, screens
tests/                     the tests on node:test; tests/fixtures — the demo set and test data
                           tests/helpers — a mock of the wishlist markup, in both Steam layouts
userscripts/               two Tampermonkey scripts for the Steam page
docs/screenshots/          the screenshots for the README
.github/workflows/         CI: node --test on push and on pull request
```

## License

[MIT](LICENSE)
