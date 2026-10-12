/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogMutations } from '../../../../hooks/mutations/catalog-fields';
import type {
	CatalogRecords,
	ControlMethodRecord,
} from '../../../../hooks/queries/catalog-record-view';
import type { ControlAssetRecord } from '../../../../hooks/queries/control-asset-record-view';

/**
 * The Vehicles, Equipment and Outreach method lists split their rows into an
 * active and an inactive group the way the Lures list does: each group under its
 * own heading, and an empty group as a line of text rather than a bare header
 * row (#1667).
 */

const assetRecords = vi.hoisted(() => ({
	current: { activeRecords: [], inactiveRecords: [] } as CatalogRecords<ControlAssetRecord>,
}));

const assetMutations = {
	canWrite: true,
	create: vi.fn(),
	save: vi.fn(),
	setActive: vi.fn(),
	remove: vi.fn(),
};

vi.mock('../../../../hooks/mutations/use-vehicle-mutations', () => ({
	useVehicleMutations: () => assetMutations,
}));
vi.mock('../../../../hooks/mutations/use-equipment-mutations', () => ({
	useEquipmentMutations: () => assetMutations,
}));
vi.mock('../../../../hooks/queries/use-catalog-records', () => ({
	useCatalogRecords: () => assetRecords.current,
}));

const { EquipmentLookupList, VehicleLookupList } = await import(
	'../../../../components/my-organization/control-asset-lookup'
);
const { ControlMethodLookupList } = await import(
	'../../../../components/my-organization/control-method-lookup'
);

const methodMutations: CatalogMutations = {
	canWrite: true,
	create: vi.fn(),
	save: vi.fn(),
	setActive: vi.fn(),
	remove: vi.fn(),
	refusals: {},
};

function asset(id: string, name: string, isActive: boolean): ControlAssetRecord {
	return { id, name, serialNumber: null, metadata: null, isActive };
}

function method(id: string, name: string, isActive: boolean): ControlMethodRecord {
	return { id, name, isActive, customSchema: null };
}

afterEach(() => {
	cleanup();
	assetRecords.current = { activeRecords: [], inactiveRecords: [] };
});

/** The group a heading names: the heading's row and whatever follows it. */
function group(heading: string): HTMLElement {
	const label = screen.getByText(heading);
	const container = label.closest('[data-slot="lookup-list-group"]');
	if (!(container instanceof HTMLElement)) {
		throw new Error(`No group holds "${heading}".`);
	}
	return container;
}

describe('Vehicles list', () => {
	it('puts inactive vehicles under their own heading', () => {
		assetRecords.current = {
			activeRecords: [asset('v1', 'Truck 7', true)],
			inactiveRecords: [asset('v2', 'Truck 3', false)],
		};
		render(<VehicleLookupList canManage />);

		expect(within(group('Active vehicles')).getByText('Truck 7')).toBeTruthy();
		expect(within(group('Inactive vehicles')).getByText('Truck 3')).toBeTruthy();
		expect(within(group('Active vehicles')).queryByText('Truck 3')).toBeNull();
	});

	it('draws an empty group as a line rather than a header row', () => {
		render(<VehicleLookupList canManage />);

		expect(screen.getByText('No active vehicles.')).toBeTruthy();
		expect(screen.getByText('No inactive vehicles.')).toBeTruthy();
		expect(screen.queryByRole('table')).toBeNull();
	});

	it('names the edit column Actions', () => {
		assetRecords.current = { activeRecords: [asset('v1', 'Truck 7', true)], inactiveRecords: [] };
		render(<VehicleLookupList canManage />);

		expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeTruthy();
		expect(screen.queryByRole('columnheader', { name: 'Edit' })).toBeNull();
	});
});

describe('Equipment list', () => {
	it('labels both groups and shows the empty one as a line', () => {
		assetRecords.current = { activeRecords: [], inactiveRecords: [asset('e1', 'Sprayer', false)] };
		render(<EquipmentLookupList canManage />);

		expect(screen.getByText('No active equipment.')).toBeTruthy();
		expect(within(group('Inactive equipment')).getByText('Sprayer')).toBeTruthy();
	});
});

describe('Outreach methods list', () => {
	function renderMethods(records: CatalogRecords<ControlMethodRecord>) {
		render(
			<ControlMethodLookupList
				canEditMethods
				canManage
				collectionKey="outreachMethods"
				mutations={methodMutations}
				records={records}
			/>,
		);
	}

	it('puts inactive methods under their own heading', () => {
		renderMethods({
			activeRecords: [method('m1', 'Door hanger', true)],
			inactiveRecords: [method('m2', 'Mailer', false)],
		});

		expect(within(group('Active outreach methods')).getByText('Door hanger')).toBeTruthy();
		expect(within(group('Inactive outreach methods')).getByText('Mailer')).toBeTruthy();
		expect(screen.getAllByRole('columnheader', { name: 'Actions' })).toHaveLength(2);
	});

	it('draws an empty group as a line rather than a header row', () => {
		renderMethods({ activeRecords: [], inactiveRecords: [] });

		expect(screen.getByText('No active outreach methods.')).toBeTruthy();
		expect(screen.getByText('No inactive outreach methods.')).toBeTruthy();
		expect(screen.queryByRole('table')).toBeNull();
	});
});
