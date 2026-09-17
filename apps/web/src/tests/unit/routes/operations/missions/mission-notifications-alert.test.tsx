/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationRefusal } from '../../../../../hooks/mutations/use-mission-notification-generation';
import {
	MissionNotificationsCard,
	StandingAlert,
} from '../../../../../routes/operations/missions/-mission-notifications-card';

/**
 * The standing alert a refused generation leaves on the mission.
 *
 * `buffer_unit_not_convertible` is the one worth pinning. It is
 * organization-wide, so one registration measuring its buffer in gallons blocks
 * generation for every mission, and nothing lists registrations across an
 * organization: they are managed from the contact that holds them. The unit
 * codes alone are a refusal nobody can act on, which is what #326 was. So this
 * asserts the rows are there and that each one points at its contact's
 * registrations page.
 */

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({
		children,
		params,
		to,
	}: {
		readonly children?: ReactNode;
		readonly params?: { readonly id?: string };
		readonly to?: string;
	}) => <a href={(to ?? '').replace('$id', params?.id ?? '')}>{children}</a>,
}));

const sessionFetch = vi.fn();
const errorToast = vi.fn();

vi.mock('@simmer-mosquito/sync', async (importOriginal) => ({
	...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
	sessionFetch: (...args: readonly unknown[]) => sessionFetch(...args),
}));

vi.mock('sonner', () => ({
	toast: { success: vi.fn(), error: (message: string) => errorToast(message) },
}));

vi.mock('../../../../../hooks/queries/use-mission-notifications', () => ({
	useMissionNotifications: () => ({ notifications: [], isReady: true, isError: false }),
}));

vi.mock('../../../../../hooks/queries/use-contact-directory', () => ({
	useContactDirectory: () => ({ contacts: [], isReady: true, isError: false }),
}));

// The button is drawn for a manager, and what this asserts is what happens
// after it is pressed.
vi.mock('../../../../../hooks/use-can-write', () => ({ useHasRole: () => true }));

afterEach(cleanup);
beforeEach(() => {
	sessionFetch.mockReset();
	errorToast.mockReset();
});

describe('StandingAlert', () => {
	it('lists each unpriceable registration under the contact that holds it', () => {
		render(
			<StandingAlert
				message={{
					kind: 'refused',
					refusal: refusal({
						unitCodes: ['gallon'],
						registrations: [
							{
								registrationId: 'r1',
								contactId: 'c1',
								contactName: 'Rosa Delgado',
								unitCode: 'gallon',
							},
							{ registrationId: 'r2', contactId: 'c2', contactName: null, unitCode: 'gallon' },
						],
					}),
				}}
			/>,
		);

		// The sentence naming the codes stays. It is what somebody recognises.
		expect(screen.getByText(/Registrations are using gallon as a buffer unit/)).toBeDefined();

		const rosa = screen.getByRole('link', { name: 'Rosa Delgado' });
		expect(rosa.getAttribute('href')).toBe('/public-engagement/contacts/c1/registrations');
		// An unnamed contact still links somewhere, so it is listed rather than
		// dropped for having no name.
		expect(screen.getByRole('link', { name: 'Unnamed contact' }).getAttribute('href')).toBe(
			'/public-engagement/contacts/c2/registrations',
		);
		expect(screen.queryByText(/not shown/)).toBeNull();
	});

	it('says how many the cap left out', () => {
		render(
			<StandingAlert
				message={{
					kind: 'refused',
					refusal: refusal({
						unitCodes: ['gallon'],
						registrations: [
							{ registrationId: 'r1', contactId: 'c1', contactName: 'Rosa', unitCode: 'gallon' },
						],
						registrationsNotShown: 40,
					}),
				}}
			/>,
		);

		expect(screen.getByText('40 more registrations are not shown.')).toBeDefined();
	});

	it('says it in the singular for one', () => {
		render(
			<StandingAlert
				message={{
					kind: 'refused',
					refusal: refusal({
						unitCodes: ['gallon'],
						registrations: [
							{ registrationId: 'r1', contactId: 'c1', contactName: 'Rosa', unitCode: 'gallon' },
						],
						registrationsNotShown: 1,
					}),
				}}
			/>,
		);

		expect(screen.getByText('1 more registration is not shown.')).toBeDefined();
	});

	it('renders a refusal that carries none as the message alone', () => {
		render(
			<StandingAlert
				message={{
					kind: 'refused',
					refusal: refusal({
						code: 'mission_has_no_items',
						reason: 'The mission has no stops.',
					}),
				}}
			/>,
		);

		expect(screen.getByText('The mission has no stops.')).toBeDefined();
		// No list, no count, and no empty bullet where a row would have been.
		expect(screen.queryAllByRole('link')).toEqual([]);
		expect(screen.queryByText(/not shown/)).toBeNull();
	});
});

describe('MissionNotificationsCard', () => {
	it('toasts a code it does not know rather than heading an alert with it', async () => {
		// The card's own path for a refusal it cannot draw. `generationRefusalOf`
		// answers null for a code outside the union, the hook rethrows, and the
		// catch in `run` toasts the sentence the server sent. Nothing stands on the
		// card, which is the difference from the six it knows (#930).
		sessionFetch.mockResolvedValue(
			new Response(
				JSON.stringify({
					error: 'mission_notifications_refused',
					code: 'mission_paused',
					reason: 'The mission is paused.',
				}),
				{ status: 409, headers: { 'content-type': 'application/json' } },
			),
		);

		render(<MissionNotificationsCard missionId="m1" />);
		fireEvent.click(screen.getByRole('button', { name: 'Generate notifications' }));

		await waitFor(() => expect(errorToast).toHaveBeenCalledWith('The mission is paused.'));
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('stands an alert for a code it knows', async () => {
		sessionFetch.mockResolvedValue(
			new Response(
				JSON.stringify({
					error: 'mission_notifications_refused',
					code: 'mission_cancelled',
					reason: 'Notifications cannot be generated for a cancelled mission.',
				}),
				{ status: 409, headers: { 'content-type': 'application/json' } },
			),
		);

		render(<MissionNotificationsCard missionId="m1" />);
		fireEvent.click(screen.getByRole('button', { name: 'Generate notifications' }));

		expect(await screen.findByText('This mission is cancelled')).toBeDefined();
		expect(screen.getByRole('alert')).toBeDefined();
		expect(errorToast).not.toHaveBeenCalled();
	});
});

function refusal(overrides: Partial<GenerationRefusal>): GenerationRefusal {
	return {
		code: 'buffer_unit_not_convertible',
		reason: 'A buffer unit could not be converted.',
		unitCodes: [],
		registrations: [],
		registrationsNotShown: 0,
		...overrides,
	};
}
