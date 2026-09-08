/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenerationRefusal } from '../../../../../hooks/mutations/use-mission-notification-generation';
import { StandingAlert } from '../../../../../routes/operations/missions/-mission-notifications-card';

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

afterEach(cleanup);

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
						reason: 'mission_has_no_items',
						message: 'The mission has no stops.',
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

function refusal(overrides: Partial<GenerationRefusal>): GenerationRefusal {
	return {
		reason: 'buffer_unit_not_convertible',
		message: 'A buffer unit could not be converted.',
		unitCodes: [],
		registrations: [],
		registrationsNotShown: 0,
		...overrides,
	};
}
