/**
 * Metro, taught where the workspace is.
 *
 * Two things Expo's defaults cannot infer inside this repo:
 *
 * 1. Sources live outside the app. `packages/auth` is imported as source (its
 *    `./browser` subpath points at `src/`), so Metro has to watch the repo root
 *    or an edit there never triggers a reload.
 * 2. pnpm does not hoist. A dependency resolved from `apps/mobile` may be
 *    physically under the root store, so both `node_modules` directories have
 *    to be on the resolver path — with the app's own first, so a version pinned
 *    here wins over whatever the root happens to have.
 *
 * `disableHierarchicalLookup` stays off deliberately: pnpm's layout leans on
 * walking up from a symlink's *real* path, and turning it off is what usually
 * breaks React Native under pnpm rather than what fixes it.
 *
 * CommonJS, and legitimately so: the repo root declares `"type": "module"` but
 * `apps/mobile/package.json` does not, and the nearest package.json is what
 * decides. That omission is deliberate — the React Native toolchain still
 * expects CJS config files.
 */

const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
	path.resolve(projectRoot, 'node_modules'),
	path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
