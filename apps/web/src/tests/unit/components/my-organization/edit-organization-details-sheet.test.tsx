/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrganizationDetailsFormValues } from '../../../../components/my-organization/types';

/**
 * The Organization details sheet inside the settings sheet frame. The
 * conversion is its only rule, so a value it refuses holds the sheet open
 * with the message in the frame's error alert and writes nothing (#1475).
 */

const saveOrganizationDetails = vi.fn();

vi.mock('../../../../hooks/mutations/use-organization-settings-mutations', () => ({
	useOrganizationSettingsMutations: () => ({ canWrite: true, saveOrganizationDetails }),
}));

const { EditOrganizationDetailsSheet } = await import(
	'../../../../components/my-organization/edit-organization-details-sheet'
);

const DETAILS: OrganizationDetailsFormValues = {
	name: 'Coastal Mosquito Control',
	mainContactEmail: 'office@example.org',
	phoneNumber: '',
	mailingAddressLine1: '',
	mailingAddressLine2: '',
	mailingLocality: '',
	mailingRegion: '',
	mailingPostalCode: '',
	timezone: 'America/New_York',
};

beforeEach(() => {
	saveOrganizationDetails.mockReset();
	saveOrganizationDetails.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('EditOrganizationDetailsSheet', () => {
	it.each([
		['Organization name', '', 'Organization name is required.'],
		['Main contact', 'not-an-email', 'Main contact must be a valid email address.'],
	])('refuses %s set to %o in the alert and writes nothing', async (label, value, message) => {
		openSheet();
		fireEvent.change(screen.getByLabelText(label), { target: { value } });
		save();

		expect((await screen.findByRole('alert')).textContent).toContain(message);
		expect(screen.getByRole('dialog')).toBeTruthy();
		expect(saveOrganizationDetails).not.toHaveBeenCalled();
	});

	it('saves an emptied Main contact as no contact', async () => {
		openSheet();
		fireEvent.change(screen.getByLabelText('Main contact'), { target: { value: '' } });
		save();

		await vi.waitFor(() => expect(saveOrganizationDetails).toHaveBeenCalledTimes(1));
		expect(saveOrganizationDetails.mock.calls[0]?.[0]).toMatchObject({ mainContactEmail: null });
		expect(screen.queryByRole('dialog')).toBeNull();
	});
});

function openSheet(): void {
	render(<EditOrganizationDetailsSheet defaultValues={DETAILS} title="Edit Organization" />);
	fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
}

function save(): void {
	fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
}
