/**
 * The reader for SIMMER's hand-written stylesheets, shared by the two things
 * that parse them.
 *
 * `packages/ui-web/src/tests/unit/styles.contrast.test.ts` has read
 * `tokens.css` and `styles.css` since the focus ring shipped at 1.24:1, and it
 * needs values: it walks `var()` and `color-mix()` chains itself, because a
 * vitest run has no browser to resolve them. `check-registered-tokens.mjs`
 * needs names and which block each one sat in, because a role declared in
 * `:root` and never registered in `@theme` produces a utility that compiles to
 * nothing (#632).
 *
 * Those are different questions over the same text, and the parse underneath
 * them is the same three problems: comments hold semicolons, a value holds
 * nested parentheses with semicolons nowhere in sight, and a `:root` selector
 * appears twice in one file. Written twice, the second copy would have been the
 * one that drifted.
 *
 * This is not a CSS parser and does not want to be. It reads declarations out
 * of flat blocks, which is the shape both stylesheets are written in.
 */

import { readFileSync } from 'node:fs';

/**
 * Every `--name: value` declaration in a stylesheet, in source order.
 *
 * Flat: a declaration nested inside a block is read the same as a top-level
 * one, because the contrast guard wants every token the file defines and does
 * not care where it was written. Use `readBlockDeclarations` when the block
 * matters.
 *
 * @param {string} path
 * @returns {Array<{ name: string, value: string }>}
 */
export function readDeclarations(path) {
	return declarationsIn(normalize(readFileSync(path, 'utf8')));
}

/**
 * Every `--name: value` declaration inside one block of a stylesheet.
 *
 * `selector` is matched at brace depth zero, so `:root` finds the token block
 * at the top of `styles.css` rather than the `color-scheme` one nested inside
 * `@layer base`. Both are spelled `:root` and only one of them is the register.
 *
 * @param {string} path
 * @param {string} selector Written the way the file writes it, such as `:root` or `@theme inline`.
 * @returns {Array<{ name: string, value: string }>}
 */
export function readBlockDeclarations(path, selector) {
	const css = normalize(readFileSync(path, 'utf8'));
	const body = topLevelBlock(css, selector);
	if (body === null) {
		throw new Error(`No top-level \`${selector}\` block in ${path}.`);
	}
	return declarationsIn(body);
}

/** Comments carry semicolons and braces, so they come out before anything counts them. */
function normalize(css) {
	return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
}

/**
 * The body of the first `selector { … }` written at brace depth zero, or null.
 */
function topLevelBlock(css, selector) {
	let depth = 0;
	for (let i = 0; i < css.length; i++) {
		const ch = css[i];
		if (ch === '}') {
			depth--;
			continue;
		}
		if (ch === '{') {
			depth++;
			continue;
		}
		if (depth !== 0 || !css.startsWith(selector, i)) {
			continue;
		}
		const open = css.indexOf('{', i + selector.length);
		if (open === -1 || css.slice(i + selector.length, open).trim() !== '') {
			continue;
		}
		return css.slice(open + 1, closingBrace(css, open));
	}
	return null;
}

/** The index of the `}` matching the `{` at `open`. */
function closingBrace(css, open) {
	let depth = 0;
	for (let i = open; i < css.length; i++) {
		if (css[i] === '{') depth++;
		else if (css[i] === '}' && --depth === 0) return i;
	}
	throw new Error('Unbalanced braces in stylesheet.');
}

/**
 * Declarations in one chunk of normalized CSS.
 *
 * A value runs to its top-level `;`, counted with a paren depth, because
 * `color-mix(in oklch, var(--a) 40%, var(--b))` holds commas and parens and a
 * naive split on `;` would end several tokens early.
 */
function declarationsIn(css) {
	const declarations = [];
	const names = /(--[a-z0-9-]+)\s*:/gi;
	let match = names.exec(css);
	while (match !== null) {
		const start = match.index + match[0].length;
		let depth = 0;
		let end = start;
		for (; end < css.length; end++) {
			const ch = css[end];
			if (ch === '(') depth++;
			else if (ch === ')') depth--;
			else if (ch === ';' && depth === 0) break;
		}
		declarations.push({
			name: /** @type {string} */ (match[1]),
			value: css.slice(start, end).trim(),
		});
		match = names.exec(css);
	}
	return declarations;
}
