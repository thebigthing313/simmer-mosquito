/** @vitest-environment jsdom */
import { TooltipProvider } from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegistrationListing } from '../../../../hooks/queries/use-registration-directory';
import type { MinimumRole } from '../../../../lib/write-access';

/**
 * A contact's registrations, as a list you add to.
 *
 * The thing worth pinning is the filter: `is_active` is not a delete, and a
 * registration switched off still appears on missions already generated. A list
 * that dropped it with no way to ask for it back would leave somebody hunting a
 * record they know exists, and there is no agency-wide registrations page left
 * to find it on.
 *
 * The draft is the other half. Adding swaps the list for the form and cancelling
 * puts it back, which is the whole of the page's mode switching, and the form
 * cannot be reached at all by a role that may not write one.
 */

const RANK: Record<string, number | undefined> = {
	viewer: 0,
	collector: 1,
	manager: 2,
	admin: 3,
	owner: 4,
};
let signedInRole = 'manager';

vi.mock('../../../../hooks/use-can-write', () => ({
	useHasRole: (minimum: MinimumRole) => (RANK[signedInRole] ?? 0) >= (RANK[minimum] ?? 0),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ children, ...rest }: { children?: ReactNode }) => <a {...rest}>{children}</a>,
}));

vi.mock('../../../../components/app-shell', () => ({ useBreadcrumbLabel: () => undefined }));
vi.mock('../../../../components/map', () => ({ MapCanvas: () => <div data-testid="map" /> }));
let contact: Record<string, unknown> | undefined;
vi.mock('../../../../hooks/queries/use-contact-record', () => ({
	useContact: () => ({ contact, isReady: true }),
}));

// The draft is its own file with its own reads. What this file is about is the
// page around it: which mode the panel is in, and what the list shows.
vi.mock('../../../../components/registrations/registration-draft', () => ({
	RegistrationDraft: ({ onCancel }: { readonly onCancel: () => void }) => (
		<div>
			<span>Registration form</span>
			<button onClick={onCancel} type="button">
				Cancel
			</button>
		</div>
	),
}));

let listings: readonly RegistrationListing[] = [];
vi.mock('../../../../hooks/queries/use-registration-directory', () => ({
	useRegistrationDirectory: () => ({ registrations: listings, isReady: true }),
}));

vi.mock('../../../../hooks/queries/use-unit-labels', () => ({
	useUnitLabels: () => ({ all: [{ id: 'unit-ft', code: 'foot', name: 'Foot' }] }),
}));

const { ContactRegistrations } = await import(
	'../../../../components/registrations/contact-registrations'
);

const CONTACT = '11111111-1111-4111-8111-111111111111';
const OTHER_CONTACT = '99999999-9999-4999-8999-999999999999';

function listing(overrides: Partial<RegistrationListing> = {}): RegistrationListing {
	return {
		id: '22222222-2222-4222-8222-222222222222',
		contactId: CONTACT,
		lat: 35.5,
		lng: -90.5,
		geomType: 'Polygon',
		bufferDistance: 500,
		bufferUnitId: 'unit-ft',
		hasBees: false,
		isNoSpray: false,
		isActive: true,
		...overrides,
	};
}

function renderPage() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={client}>
			<TooltipProvider>
				<ContactRegistrations contactId={CONTACT} />
			</TooltipProvider>
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	signedInRole = 'manager';
	listings = [listing()];
	contact = {
		id: CONTACT,
		contactName: 'Ana Reyes',
		company: 'City Works',
		department: null,
		title: 'Property Manager',
		preferredPhone: '555-0100',
		alternatePhone: null,
		email: 'ana@example.org',
		wantsEmail: true,
		wantsSms: false,
		wantsPhone: false,
	};
});

afterEach(cleanup);

describe('ContactRegistrations', () => {
	it('names the contact these registrations are for, and how to reach them', () => {
		// While the form is open the person is otherwise named nowhere but the
		// breadcrumb, and whether a shape is the right one to warn about is a
		// question about a person.
		renderPage();

		expect(screen.getByText('Ana Reyes')).toBeTruthy();
		expect(screen.getByText('Property Manager · City Works')).toBeTruthy();
		expect(screen.getByText('555-0100 · ana@example.org')).toBeTruthy();
	});

	it('says which channels the contact agreed to, either way', () => {
		// A registration is a promise to warn somebody. A missing badge would leave
		// "wants it" and "nobody said" looking the same, so all three are shown.
		renderPage();

		expect(screen.getByText('Wants Email')).toBeTruthy();
		expect(screen.getByText('No SMS')).toBeTruthy();
		expect(screen.getByText('No Phone')).toBeTruthy();
	});

	it('says so when there is no way to reach the contact at all', () => {
		contact = {
			id: CONTACT,
			contactName: null,
			company: null,
			department: null,
			title: null,
			preferredPhone: null,
			alternatePhone: null,
			email: null,
			wantsEmail: false,
			wantsSms: false,
			wantsPhone: false,
		};
		renderPage();

		expect(screen.getByText('Unnamed contact')).toBeTruthy();
		expect(screen.getByText('No phone number or email recorded.')).toBeTruthy();
	});

	it('keeps the contact on screen while a registration is being added', () => {
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Add registration' }));

		expect(screen.getByText('Registration form')).toBeTruthy();
		expect(screen.getByText('Ana Reyes')).toBeTruthy();
	});

	it('lists only the registrations this contact holds', () => {
		listings = [
			listing({ id: 'mine' }),
			listing({ id: 'theirs', contactId: OTHER_CONTACT, geomType: 'Point' }),
		];
		renderPage();

		expect(screen.getByText('Area')).toBeTruthy();
		expect(screen.queryByText('Point')).toBeNull();
	});

	it('says what each registration covers, in the unit it was written in', () => {
		renderPage();

		expect(screen.getByText('500 foot around it')).toBeTruthy();
	});

	it('says so when a registration has no buffer', () => {
		listings = [listing({ bufferDistance: null, bufferUnitId: null })];
		renderPage();

		expect(screen.getByText('The shape itself, with no buffer')).toBeTruthy();
	});

	it('hides inactive registrations until they are asked for', () => {
		// `is_active` is not a delete. One switched off still appears on missions
		// already generated, so hiding it with no way back would leave somebody
		// hunting a record they know exists.
		listings = [listing({ id: 'off', isActive: false })];
		renderPage();

		expect(screen.getByText('No registrations yet')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Include inactive' }));

		expect(screen.getByText('Area')).toBeTruthy();
		expect(screen.getByText('Inactive')).toBeTruthy();
	});

	it('swaps the list for the form when a registration is added, and back on cancel', () => {
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Add registration' }));
		expect(screen.getByText('Registration form')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Add registration' })).toBeNull();

		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByText('Registration form')).toBeNull();
		expect(screen.getByRole('button', { name: 'Add registration' })).toBeTruthy();
	});

	it('opens the form on the registration whose Edit was pressed', () => {
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

		expect(screen.getByText('Registration form')).toBeTruthy();
	});

	it('offers neither adding nor editing to a role that cannot write one', () => {
		signedInRole = 'collector';
		renderPage();

		expect(screen.queryByRole('button', { name: 'Add registration' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
	});
});
