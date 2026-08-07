import type { ContactRow } from '@simmer-mosquito/sync';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { isBelowRole } from '../../../lib/write-access';
import { webCollections } from '../../../sync/webCollections';
import {
	type ContactFormValues,
	contactFieldsFromValues,
	defaultContactFormValues,
} from '../-contact-fields';
import { settleWrite } from '../-public-engagement-writes';
import { ContactFormPage } from './-contact-form';

export const Route = createFileRoute('/public-engagement/contacts/create')({
	beforeLoad: async ({ context }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({ replace: true, to: '/public-engagement/contacts' });
		}
	},
	component: CreateContactRoute,
});

const warmGcTimeMs = 30_000;

function CreateContactRoute() {
	const { auth } = Route.useRouteContext();
	const navigate = useNavigate();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const organizationId = organization?.id ?? '';

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

	// contacts syncs on demand; keep the org's stream warm so the insert's txid
	// confirmation resolves instead of timing out against a cold shape.
	//
	// The row itself is never read, so there is no order worth imposing — but a
	// limit without one is a compile error in TanStack DB, and an unordered
	// `limit` is what crashed this page to "Unable to load workspace data". `id`
	// is the ordering that costs nothing: it is the primary key, so it is already
	// indexed, and an ordered limit on an unindexed column would load the whole
	// collection to serve one row.
	useLiveQuery(
		{
			gcTime: warmGcTimeMs,
			query: (query) =>
				query
					.from({ contact: webCollections.contacts })
					.where(({ contact }) => eq(contact.organizationId, organizationId))
					.orderBy(({ contact }) => contact.id)
					.limit(1),
		},
		[organizationId],
	);

	const onSave = useCallback(
		async (values: ContactFormValues) => {
			if (organization === null) {
				throw new Error('Organization details are still loading.');
			}
			if (actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}

			const now = new Date().toISOString();
			const row: ContactRow = {
				id: crypto.randomUUID(),
				organizationId: organization.id,
				...contactFieldsFromValues(values),
				metadata: null,
				createdByProfileId: actorProfileId,
				updatedByProfileId: actorProfileId,
				createdAt: now,
				updatedAt: now,
			};

			await settleWrite(webCollections.contacts.insert(row));
			await navigate({ to: '/public-engagement/contacts/$id', params: { id: row.id } });
		},
		[organization, actorProfileId, navigate],
	);

	return (
		<ContactFormPage
			canSubmit={canSubmit}
			defaultValues={defaultContactFormValues()}
			header={{
				title: 'Create Contact',
				description: 'Add a public person or organization to the agency contact list.',
				backTo: '/public-engagement/contacts',
				backLabel: 'Contacts',
			}}
			onSave={onSave}
			submitLabel="Create Contact"
		/>
	);
}
