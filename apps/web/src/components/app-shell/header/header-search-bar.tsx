import { Kbd } from '@simmer-mosquito/ui-web/components/ui/kbd';
import { useEffect, useRef, useState } from 'react';
import { SearchInput } from '../../input/search-input';

/**
 * Global search affordance. A focusable field with a platform-aware shortcut
 * hint; `⌘K` / `Ctrl K` focuses it from anywhere in the shell. The query is
 * local for now — wiring it to a command palette comes later.
 */
export function HeaderSearchBar() {
	const inputRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState('');
	const [modKey] = useState(() =>
		typeof navigator !== 'undefined' && /mac/i.test(navigator.platform) ? '⌘' : 'Ctrl',
	);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				inputRef.current?.focus();
			}
		}

		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, []);

	return (
		<SearchInput
			aria-label="Search"
			className="h-9 w-full max-w-md bg-background"
			endAddon={
				<>
					<Kbd>{modKey}</Kbd>
					<Kbd>K</Kbd>
				</>
			}
			onChange={(event) => setQuery(event.target.value)}
			placeholder="Search SIMMER…"
			ref={inputRef}
			value={query}
		/>
	);
}
