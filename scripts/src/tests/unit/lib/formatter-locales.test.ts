/**
 * The call reader `check-formatter-locales.mjs` holds the display-formatter
 * convention with.
 *
 * The rule is that each of the five formatter calls passes its locale tag as a
 * string literal. The gate's own `PROBES` hold one source per shape at run
 * time; this suite holds the rest of the table, the argument list shapes a
 * reader one notch too narrow gets wrong, because each is one line to state.
 */

import { describe, expect, it } from 'vitest';
import { formatterCalls } from '../../../../lib/formatter-locales.mjs';

const problems = (source: string) => formatterCalls(source).map((call) => call.problem);

describe('formatterCalls', () => {
	it('finds each of the five call forms', () => {
		const source = [
			"new Intl.DateTimeFormat('en-US', { timeZone });",
			"new Intl.NumberFormat('en-US');",
			"value.toLocaleString('en-US');",
			"date.toLocaleDateString('en-US');",
			"date.toLocaleTimeString('en-US');",
		].join('\n');

		expect(formatterCalls(source).map((call) => call.form)).toEqual([
			'Intl.DateTimeFormat',
			'Intl.NumberFormat',
			'toLocaleString',
			'toLocaleDateString',
			'toLocaleTimeString',
		]);
		expect(problems(source)).toEqual([null, null, null, null, null]);
	});

	it('reads a literal tag as pinned whichever quote and whatever tag', () => {
		expect(problems('x.toLocaleString("en-GB");')).toEqual([null]);
		expect(problems("x.toLocaleString('en-CA', { year: 'numeric' });")).toEqual([null]);
	});

	it('reports the index and the tag a call passed', () => {
		const source = "const f = new Intl.NumberFormat('en-US');";
		expect(formatterCalls(source)).toEqual([
			{
				form: 'Intl.NumberFormat',
				index: source.indexOf('Intl'),
				argument: "'en-US'",
				problem: null,
			},
		]);
	});

	it('refuses a call with no argument', () => {
		expect(problems('x.toLocaleDateString();')).toEqual(['passes no locale tag']);
		expect(problems('new Intl.DateTimeFormat().resolvedOptions();')).toEqual([
			'passes no locale tag',
		]);
	});

	it('refuses undefined, which is the runtime default spelled out', () => {
		expect(problems("new Intl.NumberFormat(undefined, { style: 'unit' });")).toEqual([
			'passes undefined, which is the runtime locale',
		]);
	});

	it("refuses the string 'default', which is the runtime default as a tag", () => {
		expect(problems("d.toLocaleString('default', { month: 'short' });")).toEqual([
			"passes 'default', which is the runtime locale",
		]);
	});

	it('refuses the empty string, which no formatter accepts', () => {
		expect(problems("d.toLocaleString('');")).toEqual(['passes an empty string, which is no tag']);
	});

	it('refuses a tag that is not a string literal', () => {
		expect(problems('d.toLocaleString(locale);')).toEqual([
			'passes locale, which is not a string literal',
		]);
		expect(problems('d.toLocaleString(navigator.language);')).toEqual([
			'passes navigator.language, which is not a string literal',
		]);
		expect(problems('d.toLocaleString(`en-US`);')).toEqual([
			'passes `en-US`, which is not a string literal',
		]);
		expect(problems("d.toLocaleString(['en-US']);")).toEqual([
			"passes ['en-US'], which is not a string literal",
		]);
		expect(problems('d.toLocaleString(...args);')).toEqual([
			'passes ...args, which is not a string literal',
		]);
	});

	it('reads the first argument to its own comma, not one inside it', () => {
		expect(problems("d.toLocaleString(pick(a, b), { month: 'short' });")).toEqual([
			'passes pick(a, b), which is not a string literal',
		]);
	});

	it('does not read toLocaleLowerCase or toLocaleUpperCase, which format nothing', () => {
		expect(formatterCalls('s.toLocaleLowerCase();\ns.toLocaleUpperCase();')).toEqual([]);
	});

	it('does not read a type position or a static member as a call', () => {
		const source = [
			'const read = (type: Intl.DateTimeFormatPartTypes) => type;',
			'function f(options: Intl.DateTimeFormatOptions) { return options; }',
			"Intl.DateTimeFormat.supportedLocalesOf(['en-US']);",
		].join('\n');
		expect(formatterCalls(source)).toEqual([]);
	});

	it('does not read a call named in a comment or a string', () => {
		const source = [
			'// date.toLocaleDateString() with no zone reads the browser.',
			"const label = 'new Intl.NumberFormat()';",
		].join('\n');
		expect(formatterCalls(source)).toEqual([]);
	});

	it('reads an argument list that runs over several lines', () => {
		const source = 'new Intl.NumberFormat(\n\t\tundefined,\n\t\t{ style: "unit" },\n\t);';
		expect(problems(source)).toEqual(['passes undefined, which is the runtime locale']);
	});
});
