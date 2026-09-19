import { useEffect, useState } from 'react';

export interface CssToken {
	readonly name: string;
	readonly value: string;
}

/**
 * The computed values of the given CSS custom properties on the document
 * element, read after mount.
 */
export function useCssTokens(tokenNames: readonly string[]) {
	const [tokens, setTokens] = useState<readonly CssToken[]>([]);

	useEffect(() => {
		const styles = window.getComputedStyle(document.documentElement);
		setTokens(
			tokenNames.map((name) => ({
				name,
				value: styles.getPropertyValue(name).trim(),
			})),
		);
	}, [tokenNames]);

	return tokens;
}
