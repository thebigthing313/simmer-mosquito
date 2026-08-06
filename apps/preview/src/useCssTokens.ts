import { useEffect, useState } from 'react';

interface CssToken {
	readonly name: string;
	readonly value: string;
}

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
