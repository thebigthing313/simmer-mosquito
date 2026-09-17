/**
 * The detector behind `pnpm check:unread-declarations`.
 *
 * The gate is at zero with no allowance list, so the only thing standing
 * between a dead declaration and a green branch is this predicate. Two ways it
 * can be wrong cost different things: reading a live declaration as dead sends
 * somebody to delete working code, and reading a dead one as live is the silent
 * pass the gate was written to remove.
 *
 * Every case passes a source string rather than reading a file, so the source
 * and the expectation sit next to each other. The two mentions worth their own
 * cases are a name that appears only inside a string and one that appears only
 * inside a comment: a scan over the text reads both as a use, which is the
 * whole reason the detector is a parse.
 */

import { describe, expect, it } from 'vitest';
import { unreadDeclarations } from '../../../../lib/unread-declarations.mjs';

/** The names a run reported, which is all any case here asserts on. */
const namesIn = (source: string, path = 'probe.ts'): string[] =>
	unreadDeclarations(path, source).map((finding) => finding.name);

describe('unreadDeclarations', () => {
	it('reports a declaration nothing reads', () => {
		expect(namesIn('const _x = 1;\n')).toEqual(['_x']);
		expect(namesIn('function _f() {\n\treturn 1;\n}\n')).toEqual(['_f']);
		expect(namesIn('class _C {}\n')).toEqual(['_C']);
		expect(namesIn("import { thing as _thing } from './somewhere';\n")).toEqual(['_thing']);
	});

	it('names the line the declaration is on', () => {
		expect(unreadDeclarations('probe.ts', 'const a = 1;\nvoid a;\nconst _x = 2;\n')).toEqual([
			{ name: '_x', line: 3 },
		]);
	});

	it('leaves a declaration something reads alone', () => {
		expect(namesIn('const _x = 1;\nexport const y = _x + 1;\n')).toEqual([]);
	});

	it('counts a read from a type position', () => {
		expect(namesIn('const _x = { a: 1 };\nexport type T = typeof _x;\n')).toEqual([]);
	});

	it('counts a read from JSX', () => {
		expect(
			namesIn('const _C = () => <div />;\nexport const A = () => <_C />;\n', 'probe.tsx'),
		).toEqual([]);
	});

	it('reads a name that appears only inside a string as no read at all', () => {
		expect(namesIn("const _x = 1;\nexport const label = '_x';\n")).toEqual(['_x']);
		expect(namesIn('const _x = 1;\nexport const label = `see _x`;\n')).toEqual(['_x']);
	});

	it('reads a name that appears only inside a comment as no read at all', () => {
		expect(namesIn('const _x = 1;\n// _x is named here and nowhere else.\n')).toEqual(['_x']);
	});

	it('leaves a parameter alone', () => {
		expect(namesIn('export const f = (_a: number, b: number) => b;\n')).toEqual([]);
	});

	it('leaves a catch binding alone', () => {
		expect(
			namesIn(
				'export const f = (g: () => void) => {\n\ttry {\n\t\tg();\n\t} catch (_error) {\n\t\treturn null;\n\t}\n\treturn 1;\n};\n',
			),
		).toEqual([]);
	});

	it('leaves a destructuring omission alone', () => {
		expect(
			namesIn(
				'export const f = (o: { a: number; b: number }) => {\n\tconst { a: _a, ...rest } = o;\n\treturn rest;\n};\n',
			),
		).toEqual([]);
	});

	it('leaves an ambient declaration alone', () => {
		expect(namesIn('declare const _x: string;\n')).toEqual([]);
	});

	it('leaves an export alone, since whether anything reads one is a question for fallow dead-code', () => {
		expect(namesIn('export const _x = 1;\n')).toEqual([]);
		expect(namesIn('const _x = 1;\nexport { _x };\n')).toEqual([]);
	});

	it('reads a shadowed outer declaration as dead on its own', () => {
		expect(
			namesIn('const _x = 1;\nexport const f = () => {\n\tconst _x = 2;\n\treturn _x;\n};\n'),
		).toEqual(['_x']);
	});

	it('throws on a module that does not parse, rather than reporting nothing', () => {
		expect(() => unreadDeclarations('probe.ts', 'const _x = ;\n')).toThrow();
	});
});
