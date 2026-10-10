/** @vitest-environment jsdom */
import type { OrganizationSettings } from '@simmer-mosquito/domain';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The larval sheet inside the settings sheet frame. A fractional density bound
 * saves, since the form leaves validation to the conversion, and an emptied
 * one holds the sheet open with the message naming its band and field (#1454).
 */

const setLarvalInspectionEntryPolicy = vi.fn();

vi.mock('../../../../hooks/mutations/use-organization-settings-mutations', () => ({
	useOrganizationSettingsMutations: () => ({ canWrite: true, setLarvalInspectionEntryPolicy }),
}));

const { EditLarvalSettingsSheet } = await import(
	'../../../../components/my-organization/edit-larval-settings-sheet'
);

const SETTINGS = {
	larvalSurveillance: {
		inspectionEntryPolicy: {
			mode: 'hybrid',
			densityRanges: {
				light: { minInclusive: 0, maxExclusive: 1 },
				medium: { minInclusive: 1, maxExclusive: 5 },
				heavy: { minInclusive: 5, maxExclusive: 10 },
				veryHeavy: { minInclusive: 10 },
			},
		},
	},
} as unknown as OrganizationSettings;

beforeEach(() => {
	setLarvalInspectionEntryPolicy.mockReset();
	setLarvalInspectionEntryPolicy.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('EditLarvalSettingsSheet', () => {
	it('opens on the saved bands', () => {
		openSheet();

		expect(bound('Medium', 'Greater than').value).toBe('1');
		expect(bound('Medium', 'Up to and including').value).toBe('5');
	});

	it('saves a fractional bound', async () => {
		openSheet();
		fireEvent.change(bound('Light', 'Up to and including'), { target: { value: '0.5' } });
		fireEvent.change(bound('Medium', 'Greater than'), { target: { value: '0.5' } });
		save();

		await vi.waitFor(() => expect(setLarvalInspectionEntryPolicy).toHaveBeenCalledTimes(1));
		expect(setLarvalInspectionEntryPolicy).toHaveBeenCalledWith({
			mode: 'hybrid',
			densityRanges: {
				light: { minInclusive: 0, maxExclusive: 0.5 },
				medium: { minInclusive: 0.5, maxExclusive: 5 },
				heavy: { minInclusive: 5, maxExclusive: 10 },
				veryHeavy: { minInclusive: 10 },
			},
		});
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('refuses an emptied bound inline, naming its band and field', async () => {
		openSheet();
		fireEvent.change(bound('Heavy', 'Up to and including'), { target: { value: '' } });
		save();

		expect((await screen.findByRole('alert')).textContent).toContain(
			'Up to and including in Heavy is required.',
		);
		expect(screen.getByRole('dialog')).toBeTruthy();
		expect(setLarvalInspectionEntryPolicy).not.toHaveBeenCalled();
	});
});

function openSheet(): void {
	render(<EditLarvalSettingsSheet settings={SETTINGS} />);
	fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
}

function save(): void {
	fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
}

function bound(band: string, label: string): HTMLInputElement {
	return within(screen.getByRole('group', { name: band })).getByLabelText(
		label,
	) as HTMLInputElement;
}
