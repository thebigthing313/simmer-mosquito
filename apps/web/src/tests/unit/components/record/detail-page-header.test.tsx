/** @vitest-environment jsdom */

/**
 * Where the detail header puts the tag picker (#1266).
 *
 * The picker used to open from a `Tags` button at the right end of the bar.
 * It opens from an `Edit tags` item in the `...` now, after the page's own
 * actions and above the Delete rule, and the chips stay at the right end for
 * every role. The item follows the Collector floor for assigning a Tag, so a
 * Viewer does not see it, and a Viewer whose menu held nothing else gets no
 * `...` at all. A record type that cannot be tagged passes no `tags`, and its
 * menu has no item for them.
 *
 * The record's Tags come from a stand-in for the query hook, since how they are
 * read is `use-record-tags.test.tsx`'s question. The picker's catalog and the
 * tag writes are stand-ins too: this asks that the dialog opens, not what it
 * lists.
 */

import type { SimmerRole } from '@simmer-mosquito/domain';
import { TooltipProvider } from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssignedTag } from '../../../../hooks/queries/tag-view';

const harness = vi.hoisted(() => ({
	role: 'collector' as SimmerRole,
	selected: [] as string[],
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ children }: { children?: ReactNode }) => <a href="/stand-in">{children}</a>,
}));

vi.mock('../../../../hooks/use-auth-snapshot', async () => {
	const { signedInSnapshotAs } = await import('../../routes/route-mock-stand-ins');
	return { useAuthSnapshot: () => signedInSnapshotAs(harness.role) };
});

const ASSIGNED: readonly AssignedTag[] = [
	{
		id: 'tag-standing-water',
		tagItemId: 'tag-item-1',
		name: 'Standing water',
		color: null,
		description: null,
	},
];

vi.mock('../../../../hooks/queries/use-record-tags', () => ({
	useRecordTags: () => ASSIGNED,
}));

vi.mock('../../../../hooks/queries/use-tag-picker-catalog', () => ({
	useTagPickerCatalog: () => [],
}));

vi.mock('../../../../hooks/mutations/use-record-tag-mutations', () => ({
	useRecordTagMutations: () => ({ assign: vi.fn(), unassign: vi.fn() }),
}));

const { DetailPageHeader } = await import('../../../../components/record/detail-page-header');

beforeEach(() => {
	harness.role = 'collector';
	harness.selected.length = 0;
});

afterEach(cleanup);

const WaterIcon = iconRegistry.entities.habitat.icon;

/** A habitat's bar, which can be tagged, with one action of the page's own. */
function taggableHeader() {
	return (
		<TooltipProvider>
			<DetailPageHeader
				actions={[
					{
						id: 'inspect',
						label: 'Record Inspection',
						icon: WaterIcon,
						onSelect: () => harness.selected.push('inspect'),
					},
				]}
				icon={WaterIcon}
				recordType="habitat"
				tags={{ recordId: 'habitat-1', recordType: 'habitat' }}
				title="Ditch 14"
			/>
		</TooltipProvider>
	);
}

/** A request for control's bar, a record type with no Tags. */
function untaggableHeader() {
	return (
		<TooltipProvider>
			<DetailPageHeader
				actions={[
					{
						id: 'resolve',
						label: 'Mark Resolved',
						icon: WaterIcon,
						onSelect: () => harness.selected.push('resolve'),
					},
				]}
				icon={WaterIcon}
				recordType="requestedControlAction"
				title="Ditch behind the depot"
			/>
		</TooltipProvider>
	);
}

async function openMenu(): Promise<readonly string[]> {
	fireEvent.pointerDown(
		screen.getByRole('button', { name: 'More actions' }),
		new PointerEvent('pointerdown', { bubbles: true, ctrlKey: false, button: 0 }),
	);
	await screen.findAllByRole('menuitem');
	return screen.getAllByRole('menuitem').map((item) => item.textContent ?? '');
}

describe('the tag picker in the detail header', () => {
	it('offers Edit tags after the page actions on a taggable record', async () => {
		render(taggableHeader());

		expect(await openMenu()).toEqual(['Record Inspection', 'Edit tags']);
	});

	it('draws the chips and no standalone Tags button', () => {
		render(taggableHeader());

		expect(screen.getByText('Standing water')).toBeTruthy();
		expect(screen.queryByRole('button', { name: /^Tags/ })).toBeNull();
	});

	it('opens the picker from the item, mounted outside the menu', async () => {
		render(taggableHeader());
		await openMenu();

		fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Edit tags' }), { key: 'Enter' });

		expect(await screen.findByRole('dialog')).toBeTruthy();
		expect(screen.queryByRole('menu')).toBeNull();
		expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
	});

	it('offers no tags item on a record type that cannot be tagged', async () => {
		render(untaggableHeader());

		expect(await openMenu()).toEqual(['Mark Resolved']);
	});

	it('shows a Viewer the chips and no menu when the tags item was all it held', () => {
		harness.role = 'viewer';
		render(
			<TooltipProvider>
				<DetailPageHeader
					icon={WaterIcon}
					recordType="habitat"
					tags={{ recordId: 'habitat-1', recordType: 'habitat' }}
					title="Ditch 14"
				/>
			</TooltipProvider>,
		);

		expect(screen.getByText('Standing water')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
	});
});
