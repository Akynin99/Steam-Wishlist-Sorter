/**
 * The bookmarklet that writes the final order into Steam.
 *
 * ## Why this exists next to the userscript
 *
 * Carrying the order into Steam used to mean Tampermonkey: install an
 * extension, switch Chrome into developer mode, create a script, paste the
 * code. That is seven steps for somebody who only wants their own wishlist
 * sorted. A bookmarklet is two: show the bookmarks bar, drag the link onto it.
 *
 * ## Why it is the *reliable* path and not the crippled one
 *
 * The order is baked into the link. The application already knows the final
 * sequence of app ids, so it writes them into the code it generates, and the
 * bookmarklet never reads the Steam page: no scrolling, no row selectors, no
 * check that the virtualized list was read to the end. Everything that breaks
 * when Steam changes its layout is simply absent. What is left is the write
 * endpoint — the one thing that was measured on a live account.
 *
 * The price is the other half of the userscript: without reading the page
 * there is no backup of the current order and no verification afterwards, and
 * the order applies to the entries that were in the list when the link was
 * generated. Both are said out loud, in the interface and in the README.
 *
 * ## What it sends
 *
 *     POST https://store.steampowered.com/wishlist/action
 *     Content-Type: application/json; charset=utf-8
 *     X-Valve-Request-Type: mutationAction
 *     { "m": "Reorder", "mp": [ [ { "appid": 1509510, "priority": 1 }, … ] ] }
 *
 * Exactly the request `steam-wishlist-import-order.user.js` sends, down to the
 * double brackets of `mp` and the header. `X-Valve-Request-Type` is not
 * decoration: without it the same request comes back `400` with an empty body.
 * Success is `data.result === 1`. `credentials: 'include'` is the whole of the
 * authorization — the address is Steam's own origin, so the browser attaches
 * the cookie of the signed-in account and the code never sees it.
 *
 * ## What goes into the link
 *
 * Code, app ids and the interface texts of the language chosen at the moment
 * of generation. No titles, no urls, no tokens, no address of our own server —
 * app ids are public numbers, and everything else would be a leak into a
 * string the user is about to paste into their browser.
 *
 * The module has no dependency on the DOM, exactly like `export.js`, so every
 * part of the link can be checked by a test character by character.
 */

import { plural, t } from './i18n.js';

/** The one address the bookmarklet writes to. */
export const REORDER_URL = 'https://store.steampowered.com/wishlist/action';

/** Id of the panel the bookmarklet puts on the page, and its own guard against a second click. */
export const PANEL_ID = 'sws-bookmarklet-panel';

/**
 * Dictionary keys the generated code carries. Listed here so that a test can
 * walk them and so that the set is one obvious place to extend.
 *
 * @type {ReadonlyArray<string>}
 */
export const BOOKMARKLET_TEXT_KEYS = Object.freeze([
  'bookmarklet.title',
  'bookmarklet.wrongPage',
  'bookmarklet.confirm',
  'bookmarklet.write',
  'bookmarklet.cancel',
  'bookmarklet.close',
  'bookmarklet.sending',
  'bookmarklet.done',
  'bookmarklet.unclear',
  'bookmarklet.refused',
  'bookmarklet.badRequest',
  'bookmarklet.signedOut',
  'bookmarklet.rateLimited',
  'bookmarklet.tooLarge',
  'bookmarklet.serverError',
  'bookmarklet.offline',
]);

/**
 * The app ids to send, in the order the wishlist has to end up in.
 *
 * The entries of the ranking come first, in their places, and the ones the
 * user marked for removal follow at the end. They are still sent: this writes
 * an order and deletes nothing, and leaving them out of the request would mean
 * leaving their place to Steam instead of stating it.
 *
 * @param {ReturnType<import('./ranking.js').RankingSession['getResult']>} result
 * @returns {number[]}
 */
export function bookmarkletAppIds(result) {
  return [
    ...result.entries.map((entry) => entry.appId),
    ...result.removed.map((item) => item.appId),
  ];
}

/**
 * The texts the generated code carries, already in their final form: the count
 * is known at generation time, so nothing inside the bookmarklet formats
 * anything, and there is no second copy of the plural rules in the link.
 *
 * @param {number} count How many entries the link carries.
 * @returns {Record<string, string>}
 */
export function bookmarkletTexts(count) {
  const items = plural('count.items', count);
  const texts = {};
  for (const key of BOOKMARKLET_TEXT_KEYS) {
    texts[key.slice('bookmarklet.'.length)] = t(key, { count, items });
  }
  return texts;
}

/**
 * The source of the bookmarklet.
 *
 * Written small on purpose — it has to fit into the address of a link and be
 * carried around in a bookmark — but not minified: what a user is about to put
 * into their bookmarks bar should be readable when they look at it. The
 * explanation of every branch is in this file, above, and not in comments
 * inside the string, because those would be paid for in the length of the
 * link.
 *
 * There is no apostrophe anywhere in it, and that is deliberate: percent
 * encoding leaves `'` as it is, and an address holding one cannot be pasted
 * into a single quoted attribute. Hence `system-ui,sans-serif` in the panel
 * style and no quoted font family.
 *
 * @param {number[]} appIds
 * @param {Record<string, string>} texts
 * @returns {string}
 */
export function bookmarkletCode(appIds, texts) {
  const ids = JSON.stringify(appIds);
  const words = JSON.stringify(texts);

  const code = `(function(){"use strict";
var d=document,L=location,A=${ids},T=${words},ID=${JSON.stringify(PANEL_ID)};
if(d.getElementById(ID))return;
var box=d.createElement("div");box.id=ID;
box.style.cssText="position:fixed;top:16px;right:16px;z-index:2147483647;width:360px;max-width:calc(100vw - 32px);padding:16px;border:1px solid #2a3947;border-radius:12px;background:#151e28;color:#dfe7ee;font:14px/1.55 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45)";
var head=d.createElement("div");head.textContent=T.title;head.style.cssText="margin-bottom:8px;font-weight:700;color:#5fd4c4";
var body=d.createElement("div");body.style.cssText="margin-bottom:14px;white-space:pre-line";
var acts=d.createElement("div");acts.style.cssText="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end";
box.appendChild(head);box.appendChild(body);box.appendChild(acts);d.body.appendChild(box);
function btn(label,strong,fn){var b=d.createElement("button");b.type="button";b.textContent=label;b.style.cssText="padding:8px 14px;border-radius:8px;border:1px solid "+(strong?"transparent":"#3a4d5f")+";background:"+(strong?"#5fd4c4":"transparent")+";color:"+(strong?"#0e141b":"#dfe7ee")+";font:inherit;font-weight:600;cursor:pointer";b.onclick=fn;acts.appendChild(b);}
function shut(){box.remove();}
function say(text){body.textContent=text;acts.textContent="";btn(T.close,true,shut);}
if(!/^store\\.steampowered\\.com$/i.test(L.hostname)||!/^\\/wishlist(\\/|$)/i.test(L.pathname)){say(T.wrongPage);return;}
body.textContent=T.confirm;
btn(T.cancel,false,shut);
btn(T.write,true,function(){
say(T.sending);
fetch(${JSON.stringify(REORDER_URL)},{method:"POST",credentials:"include",headers:{"Content-Type":"application/json; charset=utf-8","X-Valve-Request-Type":"mutationAction"},body:JSON.stringify({m:"Reorder",mp:[A.map(function(id,i){return{appid:id,priority:i+1};})]})}).then(function(res){return res.text().then(function(text){return{status:res.status,text:text};});}).then(function(a){
var s=a.status,x=a.text,login=/<\\s*html/i.test(x)&&/login|sign\\s*in/i.test(x);
if(s===413)return say(T.tooLarge);
if(s===401||s===403||login)return say(T.signedOut);
if(s===400)return say(T.badRequest);
if(s===429)return say(T.rateLimited);
if(s>=500)return say(T.serverError);
if(s<200||s>=300)return say(T.refused);
var j=null;try{j=JSON.parse(x);}catch(e){}
var r=j&&j.data?j.data.result:undefined;
if(r===1)return say(T.done);
if(r===undefined)return say(T.unclear);
return say(T.refused);
},function(){say(T.offline);});
});
})();void 0`;

  // On Windows this file is stored with CRLF, and every carriage return of the
  // template would ride into the address as `%0D` — three characters of nothing,
  // once per line. What is stored on disk must not show up in the link.
  return code.replace(/\r/g, '');
}

/**
 * The whole link: `javascript:` and the code behind it, percent encoded.
 *
 * The encoding is what makes the string safe to put into an `href` and to keep
 * in a bookmark: quotes, spaces, `&`, `<` and every non-Latin letter of the
 * Russian texts leave as `%XX`.
 *
 * The language is the one `i18n` is set to at the moment of the call, exactly
 * as with the exports: the link speaks the language the interface spoke when
 * it was generated.
 *
 * @param {ReturnType<import('./ranking.js').RankingSession['getResult']>} result
 * @returns {string}
 * @throws {Error} When there is nothing to write. A link that would send an
 *         empty list is worse than no link: it is a write that does nothing
 *         and a promise that something happened.
 */
export function bookmarkletUrl(result) {
  const appIds = bookmarkletAppIds(result);
  if (appIds.length === 0) throw new Error('the list is empty');
  return `javascript:${encodeURIComponent(bookmarkletCode(appIds, bookmarkletTexts(appIds.length)))}`;
}
