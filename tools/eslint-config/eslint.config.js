/**
 * The React rules, and the only ESLint config in this workspace.
 *
 * Biome is the linter here and it reads no React rules: `useExhaustiveDeps`,
 * `useHookAtTopLevel`, `noChildrenProp` and `noArrayIndexKey` are all absent
 * from the 208 rules it has enabled, because its `react` domain is off. So
 * nothing checked the Rules of React at all, and the React Compiler rollout
 * charted in #649 needs them: the compiler bails out on the code those rules
 * name, and #651 measured 107 findings sitting in the tree on the day this was
 * written.
 *
 * ESLint owns React and nothing else. Biome keeps everything it already has.
 *
 * ## The Biome boundary, and what to do when Biome moves it
 *
 * Biome's `react` domain stays off **deliberately**, and that is a decision
 * about suppression syntax rather than about a backlog: turning it on at
 * `recommended` costs zero findings here, but two linters holding an opinion
 * about one hook is how a line ends up needing both a `biome-ignore` and an
 * `eslint-disable`, and #291 already taught this repo that a wrapped
 * suppression comment stops suppressing without saying so.
 *
 * So a Biome release that enables a React rule is a rule to switch back off in
 * `biome.json`, not a finding to fix. That sentence is the one this file exists
 * to say, and `CLAUDE.md`'s Formatting and lint bullet points at it.
 *
 * ## Why the config is in a workspace package
 *
 * `typescript-eslint` throws at config load on TypeScript 7, which is what this
 * workspace compiles with, and it needs a real `typescript@6` in its own
 * resolution. #654 decided that should be a root devDependency under an alias,
 * `typescript6`, and the alias does not work: pnpm satisfies a peer by the name
 * it is installed under, so `typescript6` leaves the peer on the root's 7.0.2
 * and the throw stands. Injecting the dependency through
 * `pnpm.packageExtensions` does not work either, which #651 measured and this
 * branch re-measured against the `typescript-eslint` meta package that carries
 * the throw.
 *
 * What does work is a second importer. This package declares
 * `typescript@6.0.3` as its own dependency, so pnpm resolves the linter's peer
 * against it here and the workspace's own compiler is untouched. That is #654's
 * stated fallback rather than a new idea, and it is the same trade `CLAUDE.md`
 * records for Nx, which gets a private `typescript@6.0.3` through
 * `packageExtensions` for the same API removal.
 *
 * It costs `pnpm check:build-graph` nothing: that gate reads a workspace
 * project as one with both a `package.json` and a `tsconfig.json`, and this
 * package has no `tsconfig.json` because it compiles nothing.
 *
 * The root `eslint.config.js` re-exports this, so `npx eslint` from the
 * workspace root finds it and every glob below stays workspace-relative.
 *
 * ## What is configured, and what is not
 *
 * `flat.recommended` whole, all sixteen rules, no subset and nothing switched
 * off. Eleven further diagnostic categories ship `Off` inside the plugin and
 * stay off. A hand-picked subset would be a second register to re-argue on
 * every plugin bump, and switching a rule off hides a finding where
 * `pnpm lint:react` counts it.
 *
 * Type-aware rules are off and no `projectService` is configured. All sixteen
 * rules are syntactic: the two classic ones read the ESLint AST, and the
 * fourteen compiler rules run their own Babel parse and register no AST
 * visitors at all. A TypeScript program per project would be built to feed
 * rules that never ask it a question. #651's `@babel/eslint-parser` probe,
 * byte-identical with no TypeScript in the install, is the proof.
 *
 * Five projects, which is every project holding React. `apps/preview` and
 * `apps/mobile` are in even though the compiler rollout does not reach them:
 * the Rules of React are React's rather than this migration's, and the extra
 * modules are not worth a corpus boundary nobody restates once the reason for
 * it expires. The four non-React projects match no config object here, so
 * nothing lints them.
 *
 * The suites are in the corpus. #475's wrong join assertion and #618's stale
 * colour both grew inside one, and #653 found four suites that break a rule the
 * compiler cares about.
 *
 * The ignores are `biome.json`'s, narrowed to the two that fall inside these
 * globs. Both generated route trees already carry an `eslint-disable`, which
 * would otherwise report as an unused directive.
 *
 * ## What is not walked at all, and the one that is not tidiness
 *
 * ESLint walks the working directory rather than the corpus, and lints every
 * `.js` it meets whether a config object matches it or not. Left alone that is
 * 16,778 files and 108 seconds here against 1,100 files and 20, because build
 * output, the Nx cache and vendored JavaScript are all on disk.
 *
 * `.claude/worktrees` is the one that is not about time. Those are agent
 * checkouts sitting on other branches, so a run that reads them reports
 * findings from source this branch does not have, and the count moves for
 * reasons no diff can explain. `check-prose.mjs` takes the same trap the other
 * way round, by listing files through `git ls-files` rather than walking.
 */

import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/** Every project holding React, suites included. See the header. */
export const REACT_SOURCE = [
	'apps/web/src/**/*.{ts,tsx}',
	'apps/admin/src/**/*.{ts,tsx}',
	'apps/preview/src/**/*.{ts,tsx}',
	'apps/mobile/src/**/*.{ts,tsx}',
	'packages/ui-web/src/**/*.{ts,tsx}',
];

/** `biome.json`'s exclusions, narrowed to the ones a glob above can reach. */
const GENERATED = ['**/routeTree.gen.ts', 'packages/ui-web/src/components/ui/**'];

/** Everything on disk that is not this workspace's source. See the header. */
const NOT_SOURCE = [
	'**/dist/**',
	'**/coverage/**',
	'**/.expo/**',
	'.nx/**',
	'.fallow-baseline/**',
	'.claude/**',
];

export default [
	{ ignores: [...NOT_SOURCE, ...GENERATED] },
	{
		files: REACT_SOURCE,
		languageOptions: { parser: tseslint.parser, sourceType: 'module' },
	},
	{ ...reactHooks.configs.flat.recommended, files: REACT_SOURCE },
];
