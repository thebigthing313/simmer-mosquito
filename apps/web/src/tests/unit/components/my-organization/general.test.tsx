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
 * shell draws since #1045 the four columns spread across 1616px (#1054). #1054
 * then drew the table at the sum of its columns, which left it narrower than the
 * cards above it. It is full width now with the Description column left without
 * a width, so `table-fixed` hands the slack to that one column, and the column
 * sum is the floor where it starts to scroll.
 *
 * jsdom lays nothing out, so this asserts the classes.
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
	relevantEntityTypes: [],
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

beforeAll(() => {
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

describe('GeneralOrganizationSection', () => {
	it('draws the Tags table full width, floored at the sum of its column widths', () => {
		renderSection();

		const table = screen.getByRole('table');
		expect(table.classList.contains('w-full')).toBe(true);
		const floor = [...table.classList].find((cls) => cls.startsWith('min-w-'));
		for (const column of ['preview', 'description', 'color', 'actions']) {
			expect(floor).toContain(`var(--tag-${column}-column)`);
		}
	});

	it('gives the slack to the Description column alone', () => {
		renderSection();

		const headers = screen.getAllByRole('columnheader');
		const description = headers.find((header) => header.textContent === 'Description');
		expect([...(description?.classList ?? [])].some((cls) => cls.startsWith('w-'))).toBe(false);
		for (const header of headers.filter((header) => header !== description)) {
			expect([...header.classList].some((cls) => cls.startsWith('w-'))).toBe(true);
		}
	});

	it('opens the add row above the table', () => {
		renderSection();
		fireEvent.click(screen.getByRole('button', { name: /add tag/i }));

		expect(screen.getByPlaceholderText('e.g. New tag')).toBeTruthy();
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
