/** @vitest-environment jsdom */

/**
 * The Contacts directory's header, rendered whole: the subject tile, the line
 * under the title, the count, and the create control (#1657). It used the
 * generic header with a link reading "Create" while every other record index
 * carried all four, and the control's words come from the sidebar register so
 * the entry and the button are one string.
 *
 * The directory hook is faked, since what it reads is the collection's business
 * and the header only counts what it returns.
 */

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { webShellDomains } from '../../../../../components/app-shell/navigation';
import type { ContactListing } from '../../../../../hooks/queries/use-contact-directory';
import type { MinimumRole } from '../../../../../lib/write-access';
import { preloadRouteComponent } from '../../explorer-route-harness';

const harness = vi.hoisted(() => ({
	contacts: [] as ContactListing[],
	isReady: true,
	role: 'admin',
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../../route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => ({}));
});

vi.mock('../../../../../hooks/queries/use-contact-directory', () => ({
	useContactDirectory: () => ({
		contacts: harness.contacts,
		isReady: harness.isReady,
		isError: false,
	}),
}));

vi.mock('../../../../../hooks/use-can-write', async () => {
	const { roleReaches } = await import('../../explorer-route-harness');
	return { useHasRole: (minimum: MinimumRole) => roleReaches(harness.role, minimum) };
});

let ContactsDirectory: () => ReactNode;

beforeAll(async () => {
	ContactsDirectory = await preloadRouteComponent(
		() => import('../../../../../routes/public-engagement/contacts/index'),
		'contacts directory',
	);
}, 300_000);

beforeEach(() => {
	harness.contacts = [];
	harness.isReady = true;
	harness.role = 'admin';
});

afterEach(() => {
	cleanup();
});

function contact(id: string, contactName: string): ContactListing {
	return {
		id,
		contactName,
		company: null,
		department: null,
		title: null,
		email: null,
		preferredPhone: null,
		alternatePhone: null,
	};
}

/** The sidebar entry that lands on the create form, read by destination. */
function sidebarCreateLabel(): string {
	const entry = webShellDomains
		.flatMap((domain) => domain.groups)
		.flatMap((group) => group.items)
		.find((item) => item.to === '/public-engagement/contacts/create');
	if (entry === undefined) {
		throw new Error('no sidebar entry lands on the contact create form');
	}
	return entry.label;
}

describe('the Contacts directory header', () => {
	it('draws the subject tile, the line under the title and the count', () => {
		harness.contacts = [contact('c-1', 'Ada Moss'), contact('c-2', 'Ben Reed')];
		const { container } = render(<ContactsDirectory />);

		const heading = screen.getByRole('heading', { level: 1, name: 'Contacts' });
		const header = heading.closest('header');
		expect(header).not.toBeNull();
		expect(header?.querySelector('span.bg-primary\\/10 svg')).not.toBeNull();
		expect(header?.querySelector('p')?.textContent).toBeTruthy();
		expect(screen.getByText('2 contacts')).toBeTruthy();
		expect(container.querySelectorAll('header')).toHaveLength(1);
	});

	it('names its create control from the register, as the sidebar does', () => {
		render(<ContactsDirectory />);

		const label = sidebarCreateLabel();
		expect(label).toBe('Create Contact');
		const link = screen.getByRole('link', { name: label });
		expect(link.getAttribute('href')).toBe('/public-engagement/contacts/create');
	});

	it('hides the create control below the manager floor', () => {
		harness.role = 'collector';
		render(<ContactsDirectory />);

		expect(screen.queryByRole('link', { name: sidebarCreateLabel() })).toBeNull();
	});
});
