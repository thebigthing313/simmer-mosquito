/**
 * Where an offset into a file sits, as a line a reader can jump to.
 *
 * Every static gate that reports a finding with a regex reports it as
 * `path:line`, and the line is not something a match carries: `match.index` is
 * an offset in code units, so a gate has to count the newlines in front of it.
 * The count is one expression, `source.slice(0, index).split('\n').length`, and
 * by the time #767 was measured it was written out nine times, eight of them as
 * a `lineOf` of the gate's own.
 *
 * Three lines copied nine times sits below the duplication ratchet, so
 * `fallow dupes` never reported it. That is the mechanism worth naming: not that
 * nine copies are expensive, but that nothing counts them, so the tenth is
 * written by whoever adds the next gate. Two were written while the issue sat in
 * the queue, one in `check-image-names.mjs` (#672) and one in
 * `check-session-credentials.mjs` (#759).
 *
 * This is a source-position helper rather than a style rule or a marker, so it
 * sits in a module of its own rather than in `style-gate.mjs` or
 * `dash-rule.mjs`. `masked-source.mjs` was the other candidate, since it is
 * where index arithmetic already lives, and it is the wrong home for two
 * reasons: it is a TypeScript scanner, and `check-registered-tokens.mjs` counts
 * lines in a stylesheet, so half the callers would be importing a masker they
 * never run. Nothing here reads a character, which is what lets a CSS caller and
 * a TypeScript caller share it.
 */

/**
 * The one-based line an offset sits on.
 *
 * One-based because that is what an editor, a `path:line` link and every gate's
 * existing message count in. A masked copy of a source keeps its newlines and
 * its length, so an index into either answers the same here.
 *
 * @param {string} source The file the offset is into.
 * @param {number} index An offset in code units.
 * @returns {number} The line the offset is on, counting the first line as 1.
 */
export const lineOf = (source, index) => source.slice(0, index).split('\n').length;
