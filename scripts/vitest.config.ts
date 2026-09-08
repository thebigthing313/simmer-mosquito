/*
 * The vitest project over `scripts/`.
 *
 * Suites live under `src/tests/unit/`, mirroring the directory the module they
 * cover sits in, so the scanner at `scripts/lib/masked-source.mjs` is covered by
 * `src/tests/unit/lib/masked-source.test.ts`. A second suite over another module
 * in `lib/` is a second file beside it and needs nothing here.
 *
 * The `test` script is `vitest run src` with no `--passWithNoTests`, so a run
 * that collects nothing fails. Every other project in the workspace passes that
 * flag because it may legitimately have no suite; this project exists for one.
 */
export { default } from '../vitest.shared.js';
