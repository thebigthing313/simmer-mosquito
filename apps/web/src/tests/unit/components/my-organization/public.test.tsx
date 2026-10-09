/** @vitest-environment jsdom */
import type { OrganizationSettings } from '@simmer-mosquito/domain';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The service request context sheet refuses an emptied number field before
 * anything is written. `Number('')` is 0, so a cleared day window used to save
 * as 0 with no message (#1431).
 */

const setServiceRequestContext = vi.fn();

vi.mock('../../../../hooks/mutations/use-organization-settings-mutations', () => ({
	useOrganizationSettingsMutations: () => ({ canWrite: true, setServiceRequestContext }),
}));

const { PublicSettingsDrawer } = await import('../../../../components/my-organization/public');

const SETTINGS = {
	publicEngagement: {
		serviceRequestContext: {
			radius: { amount: 1, unitCode: 'mi' },
			timeWindow: { daysBefore: 7, daysAfter: 14 },
		},
	},
} as unknown as OrganizationSettings;

beforeEach(() => {
	setServiceRequestContext.mockReset();
	setServiceRequestContext.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('PublicSettingsDrawer', () => {
	it.each([
		['Days before', 'Days before is required.'],
		['Days after', 'Days after is required.'],
		['Search radius', 'Search radius is required.'],
	])('refuses an emptied %s and writes nothing', async (label, message) => {
		openSheet();
		fireEvent.change(screen.getByLabelText(label), { target: { value: '' } });
		save();

		expect((await screen.findByRole('alert')).textContent).toBe(message);
		expect(setServiceRequestContext).not.toHaveBeenCalled();
	});

	it.each([
		['0', 'Search radius must be greater than zero.'],
		['-1', 'Search radius must be greater than zero.'],
	])('refuses a Search radius of %s and writes nothing', async (value, message) => {
		openSheet();
		fireEvent.change(screen.getByLabelText('Search radius'), { target: { value } });
		save();

		expect((await screen.findByRole('alert')).textContent).toBe(message);
		expect(setServiceRequestContext).not.toHaveBeenCalled();
	});

	it('refuses a fractional day count, naming the field', async () => {
		openSheet();
		fireEvent.change(screen.getByLabelText('Days after'), { target: { value: '1.5' } });
		save();

		expect((await screen.findByRole('alert')).textContent).toBe(
			'Days after must be a nonnegative whole number.',
		);
		expect(setServiceRequestContext).not.toHaveBeenCalled();
	});

	/**
	 * A number input steps from its saved value, so from a saved 1 the browser's
	 * own validation would refuse 0.25 before the sheet's conversion ran.
	 */
	it('saves a fractional Search radius', async () => {
		openSheet();
		fireEvent.change(screen.getByLabelText('Search radius'), { target: { value: '0.25' } });
		save();

		await vi.waitFor(() => expect(setServiceRequestContext).toHaveBeenCalledTimes(1));
		expect(setServiceRequestContext).toHaveBeenCalledWith({
			radius: { amount: 0.25, unitCode: 'mi' },
			timeWindow: { daysBefore: 7, daysAfter: 14 },
		});
	});

	it('saves a day window of zero as zero', async () => {
		openSheet();
		fireEvent.change(screen.getByLabelText('Days before'), { target: { value: '0' } });
		fireEvent.change(screen.getByLabelText('Days after'), { target: { value: '0' } });
		save();

		await vi.waitFor(() => expect(setServiceRequestContext).toHaveBeenCalledTimes(1));
		expect(setServiceRequestContext).toHaveBeenCalledWith({
			radius: { amount: 1, unitCode: 'mi' },
			timeWindow: { daysBefore: 0, daysAfter: 0 },
		});
	});
});

function openSheet(): void {
	render(<PublicSettingsDrawer canManage settings={SETTINGS} />);
	fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
}

function save(): void {
	fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
}
