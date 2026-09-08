/**
 * The scan `check-vocabulary.mjs`, `check-copy-dashes.mjs`, `check-prose.mjs`'s
 * copy half and `check-join-types.mjs` all read the tree through.
 *
 * Until this file, the evidence that it worked was that those gates passed,
 * which cannot tell a correct scan from one that silently reads nothing.
 * Reading nothing is exactly what the `MINIMUM_*` floors in those gates exist to
 * catch after the fact, and #558 found two ways into it in one branch: a
 * file-wide corruption that had been latent, and a second bug introduced in the
 * same file. Both were caught by throwaway probes that were then deleted, which
 * is what this file replaces.
 *
 * Every case passes a source string rather than reading a file, so the source
 * and the expectation sit next to each other.
 */

// biome-ignore-all lint/suspicious/noTemplateCurlyInString: every fixture here is source text, so a `${` in a quoted string is the thing under test rather than a template somebody forgot to open.

import { describe, expect, it } from 'vitest';
import { maskedSource, scan } from '../../../../lib/masked-source.mjs';

/** The literal bodies the scan collected, in the order it collected them. */
const texts = (source: string) => scan(source).literals.map((literal) => literal.text);

/**
 * Where every newline in a string is, counted in code units.
 *
 * By code unit rather than by code point deliberately: an emoji is two code
 * units, so iterating with `[...text]` would report a different index for the
 * source than for its masked copy and the property would fail on the scan being
 * right.
 */
const newlineIndexes = (text: string) => {
	const indexes: number[] = [];
	for (let at = 0; at < text.length; at += 1) {
		if (text[at] === '\n') indexes.push(at);
	}
	return indexes;
};

/** The source each comment span covers, delimiters included. */
const commentTexts = (source: string) =>
	scan(source).comments.map((comment) => source.slice(comment.index, comment.end));

/**
 * One of everything the walk has a reader for, in a file with several lines.
 *
 * The three contract properties are asserted over this and over each of the
 * narrower fixtures below, because a scan that loses its place tends to lose it
 * on one shape rather than on all of them.
 */
const FIXTURES = {
	quoted: 'const label = \'Habitat\';\nconst other = "Trap";\n',
	comments: '// a line comment\nconst a = 1; /* a\nblock comment */\nconst b = 2;\n',
	regex: 'const slug = name.replace(/[^a-z]+/g, "-");\n',
	division: 'const share = total / count / 2;\nconst note = "kept";\n',
	template: 'const line = `${count} of ${total} in ${place}`;\n',
	braceInString: 'const message = `open ${format("}")} close`;\n',
	regexInExpression: 'const flag = `${/[}]/.test(input)}`;\n',
	nestedTemplate: 'const outer = `a ${inner(`b ${deep} c`)} d`;\n',
	emoji: 'const sign = "🦟";\nconst after = "Trap";\n',
} as const;

const fixtureCases = Object.entries(FIXTURES);

describe('the scan holds its place in the file', () => {
	it.each(fixtureCases)('%s keeps the masked copy the length of the source', (_name, source) => {
		expect(maskedSource(source)).toHaveLength(source.length);
	});

	it.each(fixtureCases)('%s keeps every newline where it was', (_name, source) => {
		expect(newlineIndexes(maskedSource(source))).toEqual(newlineIndexes(source));
	});

	it.each(fixtureCases)('%s collects each literal exactly once', (_name, source) => {
		const indexes = scan(source).literals.map((literal) => literal.index);
		expect(new Set(indexes).size).toBe(indexes.length);
	});

	/**
	 * The masked copy is built by code unit rather than by code point, so an
	 * index into one is an index into the other either side of an emoji. An
	 * emoji is two code units, and blanking it by code point would shorten the
	 * copy and move every line number after it.
	 */
	it('counts an emoji as the two code units the source spends on it', () => {
		const masked = maskedSource(FIXTURES.emoji);
		expect(masked).toHaveLength(FIXTURES.emoji.length);
		expect(masked).toBe('const sign = "  ";\nconst after = "    ";\n');
	});
});

describe('a slash opens either a comment or a regex literal', () => {
	it('blanks a line comment and does not collect the quote inside it', () => {
		const source = "// the Habitat's name\nconst a = 1;\n";
		expect(texts(source)).toEqual([]);
		expect(commentTexts(source)).toEqual(["// the Habitat's name"]);
		expect(maskedSource(source)).toBe('                     \nconst a = 1;\n');
	});

	it('blanks a block comment across lines and keeps the newline in it', () => {
		const source = 'const a = 1; /* "not copy"\nstill not copy */ const b = 2;\n';
		expect(texts(source)).toEqual([]);
		expect(commentTexts(source)).toEqual(['/* "not copy"\nstill not copy */']);
		expect(maskedSource(source)).toBe(
			'const a = 1;              \n                  const b = 2;\n',
		);
	});

	it('blanks a regex body, so a quote inside it opens no string', () => {
		const source = 'const re = /a"b/;\nconst kept = "Trap";\n';
		expect(texts(source)).toEqual(['Trap']);
		expect(maskedSource(source)).toBe('const re =      ;\nconst kept = "    ";\n');
	});

	it('reads a slash after a value as division and leaves it in the masked copy', () => {
		const source = FIXTURES.division;
		expect(texts(source)).toEqual(['kept']);
		expect(maskedSource(source)).toBe('const share = total / count / 2;\nconst note = "    ";\n');
	});

	/**
	 * `lastCode` is the whole of the regex-or-division question, and a comment is
	 * what makes it interesting: the first slash here divides, and the second
	 * pair opens a comment whose body must not be read as a regex.
	 */
	it('tells the second slash of a comment from a divisor', () => {
		const source = 'const share = a / b; // half of "b"\n';
		expect(texts(source)).toEqual([]);
		expect(commentTexts(source)).toEqual(['// half of "b"']);
	});
});

describe('a template literal is walked rather than skipped', () => {
	it('collects a fixed chunk between each of several interpolations', () => {
		expect(texts(FIXTURES.template)).toEqual(['', ' of ', ' in ', '']);
	});

	it('leaves the interpolated identifiers in the masked copy as code', () => {
		const masked = maskedSource(FIXTURES.template);
		expect(masked).toBe('const line = `${count}    ${total}    ${place}`;\n');
	});

	/**
	 * Every chunk is taken against the backtick, not against the `}` in front of
	 * it, so one template is one decision for a caller reading `before` (#678).
	 */
	it('gives every chunk of one template the same window in front of it', () => {
		const befores = scan(FIXTURES.template).literals.map((literal) => literal.before);
		expect(new Set(befores).size).toBe(1);
		expect(befores[0]?.endsWith('const line = ')).toBe(true);
	});

	/**
	 * The #558 corruption. Matching braces over the raw source closed the
	 * expression at the `}` inside the nested string, and every character after
	 * it in the file was then read in the wrong state, with the tail swallowed
	 * into one bogus literal.
	 */
	it('does not let a brace inside a string close the expression', () => {
		expect(texts(FIXTURES.braceInString)).toEqual(['open ', '}', ' close']);
		expect(maskedSource(FIXTURES.braceInString)).toBe(
			'const message = `     ${format(" ")}      `;\n',
		);
	});

	it('does not let a brace inside a regex literal close the expression', () => {
		expect(texts(FIXTURES.regexInExpression)).toEqual(['', '']);
		expect(maskedSource(FIXTURES.regexInExpression)).toBe('const flag = `${     .test(input)}`;\n');
	});

	it('does not let a brace inside a comment close the expression', () => {
		const source = 'const flag = `${check(/* } */ input)}`;\nconst kept = "Trap";\n';
		expect(texts(source)).toEqual(['', '', 'Trap']);
		expect(commentTexts(source)).toEqual(['/* } */']);
	});

	it('reads a template nested in an interpolation on its own turn', () => {
		expect(texts(FIXTURES.nestedTemplate)).toEqual(['a ', 'b ', ' c', ' d']);
	});

	/**
	 * The reader has to end past the whole template. Ending short sends the
	 * top-level loop back over text the template already collected, which is how
	 * a literal arrives twice.
	 */
	it('resumes after the closing backtick, so nothing is collected twice', () => {
		const source = 'const line = `${a} x ${b}`;\nconst tail = "Trap";\n';
		expect(texts(source).filter((text) => text === 'Trap')).toHaveLength(1);
		expect(texts(source)).toEqual(['', ' x ', '', 'Trap']);
	});
});

describe('what a caller reads back off a literal', () => {
	it('indexes a literal body into the source it came from', () => {
		const source = FIXTURES.quoted;
		for (const literal of scan(source).literals) {
			expect(source.slice(literal.index, literal.index + literal.text.length)).toBe(literal.text);
		}
		expect(texts(source)).toEqual(['Habitat', 'Trap']);
	});

	it('carries the source in front of the delimiter, not in front of the body', () => {
		const source = 'const attribute = <input className="grid" />;\n';
		const literal = scan(source).literals[0];
		expect(literal?.text).toBe('grid');
		expect(literal?.before.endsWith('className=')).toBe(true);
	});

	/**
	 * The walk has no idea what JSX is, so a `//` between two tags is blanked
	 * here even though it renders on screen. `copy-strings.mjs` reads the spans
	 * back to find that (#588), which is why the span is reported rather than
	 * only masked.
	 */
	it('reports a comment span between two tags rather than swallowing it', () => {
		const source = '<p>\n\t// this renders in the browser\n</p>\n';
		expect(commentTexts(source)).toEqual(['// this renders in the browser']);
	});
});
