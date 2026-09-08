/**
 * The workspace's ESLint config, which lives in `tools/eslint-config` and is
 * re-exported here.
 *
 * It is a package rather than a file because `typescript-eslint` needs a
 * private `typescript@6` in its own resolution and pnpm gives a peer to the
 * importer's copy. Read that package's header; everything this workspace
 * decided about ESLint is written there.
 *
 * This file is what makes `npx eslint` at the workspace root find it, and what
 * keeps every glob in it workspace-relative.
 */
export { default } from '@simmer-mosquito/eslint-config';
