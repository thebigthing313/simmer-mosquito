/**
 * The one register of which paths the React Compiler is switched on for.
 *
 * The rollout charted in #649 is `compilationMode: 'infer'` scoped by a path
 * allowlist that widens one phase at a time, decided in #656. A phase is an
 * entry in this list and nothing else: the app builds hand it to the preset's
 * `rolldown.filter.id`, and `check-compiler-bailouts.mjs` reads it to decide
 * which half of its rule a file falls under.
 *
 * One register, because the alternative is two. If the gate carried its own
 * copy of the allowlist then a phase would be two edits that nothing joins, and
 * the two questions "is this path compiled" and "is this path gated" could
 * answer differently with nothing on screen saying so. That is the same shape
 * as every other register this workspace holds to one place.
 *
 * ## Why a regex and not a glob
 *
 * What the build filters is a resolved absolute module id, and this is a
 * Windows checkout, so the separator is a backslash there and a forward slash
 * in CI. Every pattern therefore writes its separators as `[\/]` and anchors
 * on nothing, which makes the same pattern true of an absolute id and of a
 * repo-relative POSIX path. The gate tests the second, the build tests the
 * first, and neither needs a translation step.
 *
 * ## It ships empty, and that is the truth today
 *
 * The gate lands before the first phase, so on the day this is written nothing
 * is opted in and every module is outside the allowlist. #657 is the phase that
 * wires the app configs to this file and adds the first entry.
 *
 * There is no floor under the length of this list, and an emptied one is not a
 * silent pass. The gate's two halves are complementary: a path that leaves the
 * allowlist rejoins the ratcheted register outside it, so deleting a phase
 * fails on the checked-in file list rather than passing over nothing.
 */

/**
 * The phases switched on so far, oldest first.
 *
 * @type {ReadonlyArray<{ phase: number, name: string, issue: number, include: readonly RegExp[] }>}
 */
const COMPILER_PHASES = [];

/**
 * Every pattern of every phase, which is what the build filter takes.
 *
 * Not exported yet, and `fallow dead-code` is why: it gates unused exports at
 * zero, and the app configs are #657's edit. That branch exports this and hands
 * it to the preset's `rolldown.filter.id`.
 */
const compilerIncludes = () => COMPILER_PHASES.flatMap((phase) => phase.include);

/**
 * Whether one module is inside the allowlist.
 *
 * @param {string} path An absolute module id, or a path relative to the workspace root.
 */
export const isOptedIn = (path) => compilerIncludes().some((pattern) => pattern.test(path));
