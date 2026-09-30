/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PickerTag } from '../../../../lib/tag-relevance';

/**
 * The tag picker's catalog scrolls between the search box and the footer, so a
 * long catalog never pushes `Done` out of the dialog (#1256).
 *
 * The dialog caps its height with `max-h` alone, which gives the viewport's
 * `h-full` nothing to resolve against. So the scroll area's root and its
 * viewport are both flex items allowed to shrink below their content, and the
 * dialog is a flex column handing them what the search and the footer leave.
 */

const TAGS: readonly PickerTag[] = [
	{
		id: 'tag-standing-water',
		name: 'Standing water',
		color: null,
		description: null,
		isActive: true,
		relevantEntityTypes: [],
	},
];

vi.mock('../../../../hooks/queries/use-tag-picker-catalog', () => ({
	useTagPickerCatalog: () => TAGS,
}));

vi.mock('../../../../hooks/mutations/use-record-tag-mutations', () => ({
	useRecordTagMutations: () => ({ assign: vi.fn(), unassign: vi.fn() }),
}));

const { TagPickerDialog } = await import('../../../../components/record/tag-picker-dialog');

afterEach(cleanup);

const viewportOf = (node: Element): Element | null =>
	node.closest('[data-slot="scroll-area-viewport"]');

const classesOf = (element: Element | null | undefined): string[] =>
	(element?.getAttribute('class') ?? '').split(/\s+/);

describe('TagPickerDialog', () => {
	it('scrolls the catalog between the search box and the footer', () => {
		render(
			<TagPickerDialog
				assigned={[]}
				onOpenChange={vi.fn()}
				open
				target={{ type: 'habitat', id: 'habitat-1' }}
			/>,
		);

		const catalog = viewportOf(screen.getByRole('checkbox'));
		expect(catalog).not.toBeNull();
		expect(viewportOf(screen.getByRole('textbox', { name: 'Search tags' }))).toBeNull();
		expect(viewportOf(screen.getByRole('button', { name: 'Done' }))).toBeNull();

		const root = catalog?.parentElement;
		expect(classesOf(root)).toEqual(expect.arrayContaining(['flex', 'min-h-0', 'flex-1']));
		expect(classesOf(root?.parentElement)).toEqual(expect.arrayContaining(['flex', 'flex-col']));
	});
});
