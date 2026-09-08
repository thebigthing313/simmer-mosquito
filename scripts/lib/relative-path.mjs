/**
 * A path below a root, forward-slashed.
 *
 * Every static gate names the file a finding is in, and every one of them names
 * it the same way: relative to a root, with forward slashes whatever the
 * platform hands back. Eight gates and the schema generator each carried their
 * own copy of that, in three spellings that all do the same thing:
 * `.replaceAll('\\', '/')`, `.split(sep).join('/')` and `.replace(/\\/g, '/')`.
 * Five of the first spelling is what #687 counted.
 *
 * The slashes are not only for looks. A gate's output is read beside
 * `CLAUDE.md`, an issue and a suite, all of which write a path the POSIX way, so
 * a Windows run reporting `apps\web\src` names a file the reader then cannot
 * find by searching for it. Two callers need the shape for more than reading as
 * well: `check-preview-coverage.mjs` matches module ids against import
 * specifiers, and `generate-table-schemas.mjs` hands Biome a
 * `--stdin-file-path`.
 *
 * The root is the caller's, because it is not always the workspace. The preview
 * gate reports a module id against the components directory, so the path it
 * wants starts at `ui/table.tsx`.
 */

import { relative } from 'node:path';

/**
 * @param {string} root The directory the path is named against.
 * @param {string} path An absolute path below it.
 * @returns {string} The path from `root`, forward-slashed.
 */
export const pathFrom = (root, path) => relative(root, path).replaceAll('\\', '/');
