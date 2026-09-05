/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrapPicker } from '../../../../routes/adult-surveillance/-adult-pickers';

/**
 * Which traps are offered is the caller's question.
 *
 * The picker used to answer it itself, dropping every retired trap from its
 * rows. That made the collection form disagree with itself: it seeds a retired
 * trap from that trap's own "Record Collection", shows it in the field, and
 * then could not offer it back once the field was cleared. A trap retired
 * yesterday still needs last week's collection recorded.
 *
 * The two callers that plan future work pass `useActiveTraps`, which excludes
 * retired traps in its predicate, so nothing here changes for them. Nothing
 * pinned either half before this file.
 */

// jsdom ships none of the pointer APIs Radix's popover reaches for.
function installDomStubs(): void {
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	Element.prototype.scrollIntoView ??= () => {};
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => {};
	Element.prototype.releasePointerCapture ??= () => {};
}

const RUNNING = {
	id: '11111111-1111-4111-8111-111111111111',
	trapName: 'Mill Pond',
	trapCode: 'MP-1',
	description: 'Behind the old mill',
};

/**
 * Retired, and the shape says nothing about it: `PickableTrap` no longer
 * carries `isActive`, so a caller cannot hand the picker a lifecycle to act on
 * even by accident. The trap is retired in the organization's data; this is the
 * row for it.
 */
const RETIRED = {
	id: '22222222-2222-4222-8222-222222222222',
	trapName: 'Cedar Slough',
	trapCode: 'CS-7',
	description: 'Culvert at the bend',
};

/** The picker opens on focus, which is the only way to see its rows. */
function openPicker(traps: readonly (typeof RUNNING)[]) {
	render(<TrapPicker onSelect={() => undefined} traps={traps} value={null} />);
	const input = screen.getByPlaceholderText('Search traps');
	fireEvent.focus(input);
	return input;
}

describe('the trap picker', () => {
	beforeEach(installDomStubs);
	afterEach(cleanup);

	it('offers a retired trap alongside a running one', () => {
		openPicker([RUNNING, RETIRED]);

		expect(screen.getByText('MP-1 - Mill Pond')).toBeDefined();
		expect(screen.getByText('CS-7 - Cedar Slough')).toBeDefined();
	});

	it('finds a retired trap by its code', () => {
		const input = openPicker([RUNNING, RETIRED]);
		fireEvent.change(input, { target: { value: 'cs-7' } });

		expect(screen.getByText('CS-7 - Cedar Slough')).toBeDefined();
		expect(screen.queryByText('MP-1 - Mill Pond')).toBeNull();
	});

	// The empty state distinguishes "there are no traps" from "your term
	// matched none", and the retired rows now count towards the first.
	it('says the organization has traps when only the search missed', () => {
		const input = openPicker([RETIRED]);
		fireEvent.change(input, { target: { value: 'nothing like this' } });

		expect(screen.getByText('No trap matches')).toBeDefined();
	});
});
