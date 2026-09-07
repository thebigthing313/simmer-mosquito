import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { commandPathFor, shapePathFor, syncedColumnsOf, tableSchemas } from '../../contract.js';

const contractEntry = resolve(dirname(fileURLToPath(import.meta.url)), '../../contract.ts');

/**
 * Every specifier the contract entry reaches, following relative imports only.
 *
 * A relative edge stays inside the package and is walked; anything else is a
 * dependency and is what the test is about. Reading the source rather than
 * `dist/` is deliberate: the answer must not depend on what happens to be built,
 * which is the same reason the dead-code gate resolves through the `fallow`
 * condition.
 */
function specifiersReachedFrom(entry: string): { modules: string[]; dependencies: string[] } {
	const seen = new Set<string>();
	const dependencies = new Set<string>();

	function walk(file: string): void {
		if (seen.has(file)) return;
		seen.add(file);

		const source = readFileSync(file, 'utf8');
		const importOrExport = /(?:^|\n)\s*(?:import|export)\b[^;]*?from\s+'([^']+)'/g;

		for (const match of source.matchAll(importOrExport)) {
			const specifier = match[1] ?? '';

			// `import type` is erased, so it carries no module into the graph. The
			// contract entry may name a type from anywhere; what it may not do is
			// make a library evaluate.
			if (/^\s*(?:import|export)\s+type\b/.test(match[0].trimStart())) continue;

			if (specifier.startsWith('.')) {
				walk(resolve(dirname(file), specifier.replace(/\.js$/, '.ts')));
				continue;
			}
			dependencies.add(specifier);
		}
	}

	walk(entry);
	return { modules: [...seen], dependencies: [...dependencies].sort() };
}

describe('the contract entry', () => {
	it('answers the four questions apps/server asks', () => {
		expect(shapePathFor('habitats')).toBe('/sync/shapes/habitats');
		expect(commandPathFor('habitats')).toBe('/commands/habitats');
		expect(syncedColumnsOf(tableSchemas.habitats)).toContain('id');
		expect(Object.keys(tableSchemas)).toContain('inspections');
	});

	it('reaches no value import of the browser collection stack', () => {
		// This is the whole point of the second door (#628). `apps/server` runs
		// plain ESM with no bundler, so nothing is tree shaken: a value import of
		// either TanStack package anywhere under this entry is both libraries
		// evaluated at boot to read `Object.keys` off a zod shape.
		const { modules, dependencies } = specifiersReachedFrom(contractEntry);

		expect(dependencies).toEqual(['zod']);

		// A tripwire under the walk itself. If the regex or the extension rewrite
		// ever stops resolving, the graph collapses to the entry alone and the
		// assertion above passes while measuring nothing. The 56 schema modules
		// and their barrel put the floor comfortably above 50.
		expect(modules.length).toBeGreaterThan(50);
	});
});
