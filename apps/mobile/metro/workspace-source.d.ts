/**
 * The types of `workspace-source.js`, which is CommonJS that Metro loads, for
 * the suite that covers it. `createWorkspaceSourceResolver` is left out
 * because only `metro.config.js` calls it.
 */

export function workspaceSourceSpecifier(request: {
	packagesRoot: string;
	originModulePath: string;
	moduleName: string;
	fileExists: (file: string) => boolean;
}): string | null;
