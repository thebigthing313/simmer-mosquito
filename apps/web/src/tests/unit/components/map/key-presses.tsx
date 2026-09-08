import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@simmer-mosquito/ui-web/components/ui/select';
import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { expect } from 'vitest';
import { pressKeyIn } from './fake-map';

/**
 * The page beside the map, and what one press on it reaches `window` as.
 *
 * Both map sessions that answer Enter or Escape listen on `window` and scope
 * the press to the map's own key surface, so both need the same set of presses
 * that arrive looking like the map's and are not: a field, a chosen option, a
 * focused button, an open menu. The controls are the real `ui-web` ones,
 * because what Radix does with a key is the whole question, and a hand-made
 * event would go on passing against a version that changed its mind.
 *
 * Shared rather than written twice: `use-map-draw.test.tsx` and
 * `use-map-measure.test.tsx` ask the same thing of the same controls, and the
 * duplication ratchet counts a copy.
 */

// jsdom ships none of the pointer APIs Radix's select and menu reach for.
globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};

/** The kinds of field the panel beside the map is made of. */
const TYPED_INTO = ['input', 'textarea', 'select', 'contenteditable'] as const;

/**
 * Press `key` in a field of `kind`, the way the panel beside the map is typed
 * into.
 *
 * The field is in the document for the press, because a key pressed in one only
 * reaches the `window` listener by bubbling out to it, and being the element it
 * was pressed in is what puts it on `event.target` for the session to read.
 */
function pressInField(kind: (typeof TYPED_INTO)[number], key: string): void {
	const field = document.createElement(kind === 'contenteditable' ? 'div' : kind);
	if (kind === 'contenteditable') {
		// jsdom implements no part of contenteditable, so `isContentEditable` is
		// undefined on an element carrying the attribute. That property is what a
		// field read would ask, so the case answers it rather than the attribute.
		Object.defineProperty(field, 'isContentEditable', { value: true });
	}
	document.body.append(field);
	try {
		pressKeyIn(field, key);
	} finally {
		field.remove();
	}
}

/** Press `key` in every kind of field the panel is made of. */
export function pressInEveryField(key: string): void {
	for (const kind of TYPED_INTO) {
		pressInField(kind, key);
	}
}

/** The real `ui-web` select, which is what a record form puts beside the map. */
export function renderSelect(): void {
	render(
		<Select>
			<SelectTrigger aria-label="Habitat type">
				<SelectValue placeholder="Pick one" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="pond">Pond</SelectItem>
				<SelectItem value="ditch">Ditch</SelectItem>
			</SelectContent>
		</Select>,
	);
}

/** Open it the way a pointer does, and hand back the option it focused. */
export async function openSelect(): Promise<HTMLElement> {
	fireEvent.pointerDown(screen.getByLabelText('Habitat type'), {
		button: 0,
		ctrlKey: false,
		pointerType: 'mouse',
	});
	const option = await screen.findByText('Pond');
	const focused = document.activeElement;
	// The listbox's own option, so no part of a field read applies to it.
	expect(focused?.tagName).toBe('DIV');
	expect(focused?.getAttribute('role')).toBe('option');
	return (focused ?? option) as HTMLElement;
}

/** The select's trigger, for the press that opens it rather than the one that picks. */
export function selectTrigger(): HTMLElement {
	return screen.getByLabelText('Habitat type');
}

/** A row-actions menu, the other overlay the panel beside the map puts up. */
export function renderMenu(): void {
	render(
		<DropdownMenu>
			<DropdownMenuTrigger aria-label="Row actions">Actions</DropdownMenuTrigger>
			<DropdownMenuContent>
				<DropdownMenuItem>Rename</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>,
	);
}

/**
 * Open it with the pointer, and hand back what it focused.
 *
 * Radix focuses the content rather than an item, so this is `div[role="menu"]`
 * and none of the `menuitem` roles. That is the fifth shape a rule about where
 * a key must not have come from would have to enumerate.
 */
export async function openMenu(): Promise<HTMLElement> {
	const trigger = screen.getByLabelText('Row actions');
	fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
	fireEvent.click(trigger);
	await screen.findByText('Rename');
	return document.activeElement as HTMLElement;
}

/** A plain button beside the map, focused and ready to be pressed. */
export function renderFocusedButton(label = 'Undo'): HTMLElement {
	render(<Button>{label}</Button>);
	const button = screen.getByText(label);
	button.focus();
	return button;
}

/** What the `window` listener saw of one press, which is what says why a case passed. */
export interface WatchedPress {
	readonly reachedWindow: boolean;
	readonly defaultPrevented: boolean;
	/** The ARIA role on the pressed element, or `null` where it declares none. */
	readonly role: string | null;
	/** Whether the press landed inside the map's own key surface. */
	readonly onMapSurface: boolean;
}

/**
 * Press `key` on `element` and report what reached `window`.
 *
 * Every case using this is about a press that arrives looking like a press on
 * the map, so the report is what pins each to the reason it was written. A case
 * that stopped saying `defaultPrevented` was clear, or that the element
 * declared no role, would keep passing while the hole it covers had moved.
 */
export function pressWatched(
	element: HTMLElement,
	key: string,
	surface: HTMLElement,
): WatchedPress {
	let seen: WatchedPress = {
		reachedWindow: false,
		defaultPrevented: false,
		role: null,
		onMapSurface: false,
	};
	function record(event: KeyboardEvent) {
		seen = {
			reachedWindow: true,
			defaultPrevented: event.defaultPrevented,
			role: event.target instanceof Element ? event.target.getAttribute('role') : null,
			onMapSurface: event.target instanceof Node && surface.contains(event.target),
		};
	}
	window.addEventListener('keydown', record);
	try {
		act(() => {
			fireEvent.keyDown(element, { key });
		});
	} finally {
		window.removeEventListener('keydown', record);
	}
	return seen;
}
