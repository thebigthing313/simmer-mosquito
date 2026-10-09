/**
 * Metro's resolver, taught the NodeNext `.js` specifiers in workspace source.
 *
 * `packages/auth` writes its relative imports NodeNext style
 * (`./client/cookie-fetch.js`) and `apps/mobile` bundles that package from
 * `src/`. `tsc` maps such a specifier to the `.ts` or `.tsx` beside it; Metro
 * looks for the `.js` file and fails. Metro 0.84 has no setting for the
 * mapping, which was checked before this was written (#1342).
 *
 * The rewrite is narrow on purpose. It fires only for a relative specifier
 * ending in `.js`, imported from a file under `packages/<name>/src/` with no
 * `node_modules` on the way, and only when no `.js` file is there and a `.ts`
 * or `.tsx` is. Everything else goes to the default resolver unchanged, so a
 * dependency's imports resolve as they always did and a missing file still
 * fails with Metro's own error.
 *
 * CommonJS for the reason `metro.config.js` gives.
 */

const fs = require('node:fs');
const path = require('node:path');

const RELATIVE_JS = /^\.\.?\/.*\.js$/;
const JS = '.js';
const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

/**
 * The specifier Metro should resolve in place of `moduleName`, or `null` to
 * leave it to the default resolver.
 *
 * @param {{
 *   packagesRoot: string,
 *   originModulePath: string,
 *   moduleName: string,
 *   fileExists: (file: string) => boolean,
 * }} request
 * @returns {string | null}
 */
function workspaceSourceSpecifier({ packagesRoot, originModulePath, moduleName, fileExists }) {
	if (!RELATIVE_JS.test(moduleName)) return null;

	const segments = path.relative(packagesRoot, originModulePath).split(path.sep);
	if (segments[0] === '..' || path.isAbsolute(segments[0] ?? '')) return null;
	if (segments[1] !== 'src' || segments.includes('node_modules')) return null;

	const target = path.resolve(path.dirname(originModulePath), moduleName);
	if (fileExists(target)) return null;

	const stem = moduleName.slice(0, -JS.length);
	const targetStem = target.slice(0, -JS.length);
	for (const extension of SOURCE_EXTENSIONS) {
		if (fileExists(targetStem + extension)) return stem + extension;
	}
	return null;
}

/**
 * A `resolver.resolveRequest` applying the rewrite above, then deferring to
 * the resolver Metro hands it.
 *
 * @param {string} workspaceRoot
 */
function createWorkspaceSourceResolver(workspaceRoot) {
	const packagesRoot = path.join(workspaceRoot, 'packages');

	/**
	 * @param {{ originModulePath: string, resolveRequest: Function }} context
	 * @param {string} moduleName
	 * @param {string | null} platform
	 */
	return (context, moduleName, platform) => {
		const rewritten = workspaceSourceSpecifier({
			packagesRoot,
			originModulePath: context.originModulePath,
			moduleName,
			fileExists: (file) => fs.existsSync(file),
		});
		return context.resolveRequest(context, rewritten ?? moduleName, platform);
	};
}

module.exports = { createWorkspaceSourceResolver, workspaceSourceSpecifier };
