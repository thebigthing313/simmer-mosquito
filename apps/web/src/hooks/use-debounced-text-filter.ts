import { useEffect, useRef, useState } from 'react';

/**
 * A text filter that types locally and commits to the URL after `delayMs` of
 * no typing. `clear` only resets the input; the caller's `reset` is what drops
 * the param.
 */
export function useDebouncedTextFilter(
	urlValue: string,
	commit: (next: string) => void,
	delayMs = 250,
): {
	readonly input: string;
	readonly setInput: (next: string) => void;
	readonly clear: () => void;
} {
	const [input, setInputState] = useState(urlValue);
	const timer = useRef<number | undefined>(undefined);
	const isEditing = useRef(false);

	// Back/forward, or a filter reset, changes the URL from outside. Adopt it
	// unless the operator is mid-edit, which would yank the text they are typing.
	useEffect(() => {
		if (!isEditing.current) {
			setInputState(urlValue);
		}
	}, [urlValue]);

	useEffect(() => () => window.clearTimeout(timer.current), []);

	const setInput = (next: string) => {
		setInputState(next);
		isEditing.current = true;
		window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => {
			isEditing.current = false;
			commit(next.trim());
		}, delayMs);
	};

	const clear = () => {
		window.clearTimeout(timer.current);
		isEditing.current = false;
		setInputState('');
	};

	return { input, setInput, clear };
}
