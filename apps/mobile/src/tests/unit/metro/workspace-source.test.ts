import { describe, expect, it } from 'vitest';
import { workspaceSourceSpecifier } from '../../../../metro/workspace-source.js';

/**
 * The one specifier Metro gets wrong in this workspace: a NodeNext `.js`
 * import inside a package's TypeScript source, which `tsc` maps to the `.ts`
 * beside it and Metro, by default, does not.
 *
 * Paths are written POSIX style and the module resolves them with the host's
 * `path`, so `fileExists` compares against a normalized copy: on Windows the
 * module hands it `F:\repo\...` for `/repo/...`.
 */

const packagesRoot = '/repo/packages';
const browser = '/repo/packages/auth/src/browser.ts';

function normalize(file: string) {
	return file.replaceAll('\\', '/').replace(/^[A-Za-z]:/, '');
}

function filesAt(...relative: string[]) {
	const present = new Set(relative.map((file) => `/repo/${file}`));
	return (file: string) => present.has(normalize(file));
}

describe('workspaceSourceSpecifier', () => {
	it('maps a sibling .js specifier to the .ts beside it', () => {
		expect(
			workspaceSourceSpecifier({
				packagesRoot,
				originModulePath: browser,
				moduleName: './client/cookie-fetch.js',
				fileExists: filesAt('packages/auth/src/client/cookie-fetch.ts'),
			}),
		).toBe('./client/cookie-fetch.ts');
	});

	it('maps a parent-relative specifier the same way', () => {
		expect(
			workspaceSourceSpecifier({
				packagesRoot,
				originModulePath: '/repo/packages/auth/src/client/wire.ts',
				moduleName: '../outcomes.js',
				fileExists: filesAt('packages/auth/src/outcomes.ts'),
			}),
		).toBe('../outcomes.ts');
	});

	it('maps to a .tsx when that is the file there, as tsc does', () => {
		expect(
			workspaceSourceSpecifier({
				packagesRoot,
				originModulePath: browser,
				moduleName: './view.js',
				fileExists: filesAt('packages/auth/src/view.tsx'),
			}),
		).toBe('./view.tsx');
	});

	it('leaves a .js specifier alone when the .js file exists', () => {
		expect(
			workspaceSourceSpecifier({
				packagesRoot,
				originModulePath: browser,
				moduleName: './vendor.js',
				fileExists: filesAt('packages/auth/src/vendor.js', 'packages/auth/src/vendor.ts'),
			}),
		).toBeNull();
	});

	it('leaves a missing file to fail in the default resolver', () => {
		expect(
			workspaceSourceSpecifier({
				packagesRoot,
				originModulePath: browser,
				moduleName: './client/missing.js',
				fileExists: filesAt(),
			}),
		).toBeNull();
	});

	it('leaves a .js specifier inside node_modules alone', () => {
		expect(
			workspaceSourceSpecifier({
				packagesRoot,
				originModulePath: '/repo/node_modules/dep/src/index.js',
				moduleName: './util.js',
				fileExists: filesAt('node_modules/dep/src/util.ts'),
			}),
		).toBeNull();
	});

	it('leaves a node_modules tree under a package alone', () => {
		expect(
			workspaceSourceSpecifier({
				packagesRoot,
				originModulePath: '/repo/packages/auth/node_modules/dep/src/a.js',
				moduleName: './b.js',
				fileExists: filesAt('packages/auth/node_modules/dep/src/b.ts'),
			}),
		).toBeNull();
	});

	it('leaves a package file outside src alone', () => {
		expect(
			workspaceSourceSpecifier({
				packagesRoot,
				originModulePath: '/repo/packages/config/dist/index.js',
				moduleName: './env.js',
				fileExists: filesAt('packages/config/dist/env.ts'),
			}),
		).toBeNull();
	});

	it('leaves a bare specifier alone', () => {
		expect(
			workspaceSourceSpecifier({
				packagesRoot,
				originModulePath: browser,
				moduleName: 'dep/index.js',
				fileExists: () => true,
			}),
		).toBeNull();
	});

	it('leaves an extensionless specifier alone', () => {
		expect(
			workspaceSourceSpecifier({
				packagesRoot,
				originModulePath: browser,
				moduleName: './client/cookie-fetch',
				fileExists: () => true,
			}),
		).toBeNull();
	});
});
