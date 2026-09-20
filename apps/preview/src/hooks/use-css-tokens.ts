import { useState } from 'react';

export interface CssToken {
	readonly name: string;
	readonly value: string;
}

/**
 * The computed values of the given CSS custom properties on the document
 * element, read once when the component mounts.
 *
 * Read in a lazy initializer rather than an effect: the value never changes
 * after, and an effect drew one render with no tokens before the render with
 * them. A caller that hands in a different list is re-read in the render that
 * does, which React re-renders before committing.
 */
export function useCssTokens(tokenNames: readonly string[]): readonly CssToken[] {
	const [held, setHeld] = useState(() => ({ names: tokenNames, tokens: readTokens(tokenNames) }));
	if (!sameNames(held.names, tokenNames)) {
		setHeld({ names: tokenNames, tokens: readTokens(tokenNames) });
	}
	return held.tokens;
}

/** By content and not identity, so a caller writing the list inline does not loop. */
function sameNames(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((name, index) => name === right[index]);
}

function readTokens(tokenNames: readonly string[]): readonly CssToken[] {
	const styles = window.getComputedStyle(document.documentElement);
	return tokenNames.map((name) => ({ name, value: styles.getPropertyValue(name).trim() }));
}
