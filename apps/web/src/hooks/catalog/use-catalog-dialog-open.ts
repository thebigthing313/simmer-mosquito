import { useState } from 'react';

/**
 * The open state of a record dialog that serves two callers: its own Add
 * trigger and a row menu's Edit.
 *
 * Pass the controlled pair through and it defers to them; pass neither and it
 * keeps the state itself. Either way the page reads one `open` and calls one
 * `setOpen(false)` when a save succeeds.
 */
export function useCatalogDialogOpen(
	controlledOpen: boolean | undefined,
	onOpenChange: ((open: boolean) => void) | undefined,
): readonly [boolean, (next: boolean) => void] {
	const [internalOpen, setInternalOpen] = useState(false);
	const isControlled = controlledOpen !== undefined;

	function setOpen(next: boolean) {
		if (isControlled) {
			onOpenChange?.(next);
		} else {
			setInternalOpen(next);
		}
	}

	return [isControlled ? controlledOpen : internalOpen, setOpen];
}
