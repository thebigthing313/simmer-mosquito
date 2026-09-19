/** @vitest-environment jsdom */
import type { OrganizationSettings } from '@simmer-mosquito/domain';
import type { Organization } from '@simmer-mosquito/sync';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TagRecord } from '../../../../hooks/queries/use-tag-catalog';

/**
 * The width the Tags table draws at.
 *
 * The table declares all four column widths through CSS variables and used to
 * stretch anyway, because shadcn's `Table` is `w-full` and `table-fixed` hands
 * the slack to columns that already have widths, so at the `record` measure the
 * shell draws since #1045 the four columns spread across 1616px (#1054). Now the
 * table is as wide as its columns, the wrapper hugs it, and the add row sits in
 * the same wrapper so its box ends on the table's right edge.
 *
 * jsdom lays nothing out, so this asserts the classes and where the add row
 * sits. The width is the sum of the same four variables the columns read, so
 * there is no second number here to hold to them.
 */

vi.mock('../../../../hooks/mutations/use-organization-settings-mutations', () => ({
	useOrganizationSettingsMutations: () => ({
		canWrite: true,
		setUnitDefaults: vi.fn(),
		setOrganizationDetails: vi.fn(),
	}),
}));
vi.mock('../../../../hooks/mutations/use-tag-mutations', () => ({
	useTagMutations: () => ({
		canWrite: true,
		create: vi.fn(),
		save: vi.fn(),
		deactivate: vi.fn(),
		reactivate: vi.fn(),
		remove: vi.fn(),
	}),
}));
vi.mock('../../../../hooks/queries/use-tag-catalog', () => ({
	useTagCatalog: () => ({ activeTags: [ACTIVE_TAG], inactiveTags: [] }),
}));

const { GeneralOrganizationSection } = await import(
	'../../../../components/my-organization/general'
);

const ACTIVE_TAG: TagRecord = {
	id: 'tag_1',
	name: 'Priority',
	description: 'Follow up this week',
	color: null,
	isActive: true,
};

const ORGANIZATION = {
	id: 'org_1',
	name: 'Test Organization',
	slug: 'test',
	main_contact_email: null,
	phone_number: null,
	mailing_address_line_1: null,
	mailing_address_line_2: null,
	mailing_locality: null,
	mailing_region: null,
	mailing_postal_code: null,
	mailing_country: null,
} as unknown as Organization;

const SETTINGS = { unitDefaults: {} } as unknown as OrganizationSettings;

const FIT = `.${CSS.escape('w-fit')}`;

beforeAll(() => {
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

describe('GeneralOrganizationSection', () => {
	it('draws the Tags table at the sum of its column widths inside a wrapper that hugs it', () => {
		renderSection();

		const table = screen.getByRole('table');
		const width = [...table.classList].find((cls) => cls.startsWith('w-'));
		expect(width).toMatch(/^w-\[calc\(/);
		expect(table.classList.contains('w-full')).toBe(false);
		for (const column of ['preview', 'description', 'color', 'actions']) {
			expect(width).toContain(`var(--tag-${column}-column)`);
		}
		expect(table.closest(FIT)).not.toBeNull();
	});

	it('puts the add row in the wrapper the table sits in', () => {
		renderSection();
		fireEvent.click(screen.getByRole('button', { name: /add tag/i }));

		const table = screen.getByRole('table');
		const addRow = screen.getByPlaceholderText('e.g. New tag');
		expect(addRow.closest(FIT)).toBe(table.closest(FIT));
	});
});

function renderSection() {
	return render(
		<GeneralOrganizationSection
			canManage={true}
			canManageTags={true}
			organization={ORGANIZATION}
			organizationFields={[]}
			organizationName="Test Organization"
			settings={SETTINGS}
			timezone="America/Chicago"
			unitFields={[]}
			units={[]}
		/>,
	);
}
