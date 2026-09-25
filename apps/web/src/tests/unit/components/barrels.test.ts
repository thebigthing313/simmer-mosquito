/**
 * Every `components/<surface>/index.ts` holds re-exports and nothing else.
 *
 * `vite.config.ts` tells the bundler these barrels have no side effects, which
 * is what keeps `MapCanvas` and the explorer chrome out of the boot chunk when
 * a route keeps one name from a barrel for its `validateSearch`. A barrel that
 * grew a statement of its own would have that statement dropped from the
 * build with nothing saying so, so this case refuses one.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const componentsDir = join(import.meta.dirname, '../../../components');

const barrels = readdirSync(componentsDir, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => join(componentsDir, entry.name, 'index.ts'))
	.filter((path) => existsSync(path));

/** The source with comments gone and each statement on one line. */
function statements(source: string): string[] {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/.*$/gm, '')
		.split(';')
		.map((statement) => statement.replace(/\s+/g, ' ').trim())
		.filter((statement) => statement !== '');
}

describe('component barrels', () => {
	it('finds the barrels it is guarding', () => {
		expect(barrels.length).toBeGreaterThanOrEqual(6);
	});

	it.each(barrels)('%s only re-exports', (path) => {
		const others = statements(readFileSync(path, 'utf8')).filter(
			(statement) => !/^export (type )?(\*|\{[^}]*\}) from '[^']+'$/.test(statement),
		);

		expect(others).toEqual([]);
	});
});
