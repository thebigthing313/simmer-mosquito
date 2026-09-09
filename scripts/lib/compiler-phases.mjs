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
 * in CI. Every pattern therefore writes its separators as `[\\/]`, which makes
 * the same pattern true of both. The gate tests a repo-relative POSIX path and
 * the build tests an absolute id, so neither needs a translation step.
 *
 * The leading `(?:^|[\\/])` is the half that was missing until #820. A
 * pattern opening on `[\\/]apps` demands a separator in front of `apps`,
 * which an absolute id has and `pathFrom`'s `apps/admin/src/main.tsx` does not,
 * so the gate read every module as outside the allowlist from the day phase 1
 * shipped. Nothing failed, because admin's one finding is a `Todo` and that
 * category is counted apart from both halves. Anchoring on start-or-separator is
 * what makes the sentence above true rather than only intended.
 *
 * ## Adding a phase
 *
 * A phase is one entry here plus the `BAILING_FILES` deletions its paths cause,
 * and nothing else. The app config already reads this file, so switching a
 * surface on is a list edit rather than a config edit. What the gate then
 * demands of those paths is a hard zero, so the entry lands in the same commit
 * as the fixes and the directives that get it there.
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
const COMPILER_PHASES = [
	{
		phase: 1,
		name: 'apps/admin',
		issue: 657,
		include: [/(?:^|[\\/])apps[\\/]admin[\\/]src[\\/]/],
	},
	{
		phase: 2,
		name: 'packages/ui-web',
		issue: 820,
		include: [/(?:^|[\\/])packages[\\/]ui-web[\\/]src[\\/]/],
	},
	{
		phase: 3,
		name: 'apps/web lib and hooks',
		issue: 821,
		include: [
			/(?:^|[\\/])apps[\\/]web[\\/]src[\\/]lib[\\/]/,
			/(?:^|[\\/])apps[\\/]web[\\/]src[\\/]hooks[\\/]/,
		],
	},
];

/**
 * Every pattern of every phase, which is what the build filter takes.
 *
 * An app config hands this straight to the preset's `rolldown.filter.id`, so
 * every app is handed the whole allowlist rather than its own slice of it. That
 * is deliberate: a module reaches the Babel pass through whichever app imports
 * it, `packages/ui-web` reaches all three, and an app filtering to its own root
 * would compile a shared component in one consumer and not in the next. The
 * patterns are absolute-path shaped, so an app only ever matches the paths it
 * actually imports.
 */
export const compilerIncludes = () => COMPILER_PHASES.flatMap((phase) => phase.include);

/**
 * Whether one module is inside the allowlist.
 *
 * @param {string} path An absolute module id, or a path relative to the workspace root.
 */
export const isOptedIn = (path) => compilerIncludes().some((pattern) => pattern.test(path));
