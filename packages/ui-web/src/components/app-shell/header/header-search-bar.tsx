import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Kbd } from '@simmer-mosquito/ui-web/components/ui/kbd';
import { SearchIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { useEffect, useState } from 'react';
import { useSearchTrigger } from './search-trigger-context';

/**
 * The header's way into global search: a button, not a field.
 *
 * It used to be a 448px input that kept its query in local state and dropped it.
 * A button sized to a magnifier and the shortcut hint gives that width back to
 * the breadcrumb trail, and it is what focus returns to when the palette closes.
 * Radix restores focus through a dialog's trigger and suppresses its own
 * fallback to the previously focused element, so a palette opened only from a
 * bare global keydown drops focus on `<body>` on Escape; with a trigger on
 * screen that holds for free.
 *
 * The `⌘K` hint stays visible rather than moving into a tooltip, which is what
 * rules out a bare icon button: nobody discovers a shortcut from a magnifier.
 *
 * Renders nothing where no app has mounted a palette. `SearchInput` is untouched
 * and still used by the map filters; the shell has simply stopped being one of
 * its callers.
 */
export function HeaderSearchBar() {
	const trigger = useSearchTrigger();
	const [modKey] = useState(() =>
		typeof navigator !== 'undefined' && /mac/i.test(navigator.platform) ? '⌘' : 'Ctrl',
	);
	const onOpen = trigger?.onOpen;

	useEffect(() => {
		if (onOpen === undefined) {
			return;
		}

		function onKeyDown(event: KeyboardEvent) {
			if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				onOpen?.();
			}
		}

		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [onOpen]);

	if (trigger === null) {
		return null;
	}

	return (
		<Button
			aria-expanded={trigger.isOpen}
			aria-haspopup="dialog"
			aria-label="Search"
			className="h-9 gap-2 bg-background px-3 text-muted-foreground"
			onClick={trigger.onOpen}
			ref={trigger.triggerRef}
			type="button"
			variant="outline"
		>
			<SearchIcon aria-hidden="true" className="size-4" />
			<span className="flex items-center gap-1">
				<Kbd>{modKey}</Kbd>
				<Kbd>K</Kbd>
			</span>
		</Button>
	);
}
