/**
 * The one-off explanations shown before the two stages that need one.
 *
 * Whether an explanation has been seen is not application state: it says
 * something about the person in front of the screen, not about the wishlist
 * being sorted. That is why it lives under a key of its own next to the key
 * of the last screen, and not in `settings` — «Start over» wipes the state and
 * must not bring the tutorial back, because the user is the same one and has
 * already read it. The price is that the flags do not travel inside an
 * exported state file, and that is the right way round.
 *
 * The module itself touches neither the DOM nor the storage: it holds the
 * names, the key and the rules for reading a value back, so the tests get at
 * it directly the same way they get at `theme.js`.
 */

/** Where the flags are kept, next to `steam-wishlist-sorter/screen`. */
export const ONBOARDING_KEY = 'steam-wishlist-sorter/onboarding';

/** Stages that explain themselves once, in the order they are met. */
export const ONBOARDING_STAGES = Object.freeze(['categorize', 'compare']);

/**
 * Reads the list of stages already explained.
 *
 * Anything that is not a list of known stage names reads as «nothing has been
 * shown yet»: a cleared browser, a hand-edited value and a value written by a
 * future version all end up in the same, harmless place — the user sees an
 * explanation once more.
 *
 * @param {unknown} raw The text as it was stored, or `null`.
 * @returns {string[]} Known stage names, without repeats, in stage order.
 */
export function parseSeenStages(raw) {
  if (typeof raw !== 'string') return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];
  return ONBOARDING_STAGES.filter((stage) => parsed.includes(stage));
}

/**
 * @param {string[]} stages
 * @returns {string} The text to store.
 */
export function serializeSeenStages(stages) {
  return JSON.stringify(ONBOARDING_STAGES.filter((stage) => stages.includes(stage)));
}

/**
 * @param {string[]} stages Stages already explained.
 * @param {string} stage
 * @returns {boolean} Whether the explanation of this stage has been shown.
 */
export function isStageSeen(stages, stage) {
  return stages.includes(stage);
}

/**
 * Marks a stage as explained. The list is copied rather than pushed into, so
 * that a caller holding the previous list keeps holding it.
 *
 * @param {string[]} stages
 * @param {string} stage
 * @returns {string[]} The new list; the old one when the stage is unknown.
 */
export function withStageSeen(stages, stage) {
  if (!ONBOARDING_STAGES.includes(stage) || stages.includes(stage)) return stages;
  return ONBOARDING_STAGES.filter((name) => name === stage || stages.includes(name));
}
