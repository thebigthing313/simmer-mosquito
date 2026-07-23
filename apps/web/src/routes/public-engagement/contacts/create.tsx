import type { ContactRow } from '@simmer-mosquito/sync';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { webCollections } from '../../../sync/webCollections';
import { settleWrite } from '../-public-engagement-writes';
import {
	ContactFormPage,
	type ContactFormValues,
	contactFieldsFromValues,
	defaultContactFormValues,
} from './-contact-form';

export const Route = createFileRoute('/public-engagement/contacts/create')({
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
	useLiveQuery(
		{
			gcTime: warmGcTimeMs,
			query: (query) =>
				query
					.from({ contact: webCollections.contacts })
					.where(({ contact }) => eq(contact.organizationId, organizationId))
					.orderBy(({ contact }) => contact.id, 'asc')
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
				title: 'Create contact',
				description: 'Add a public person or organization to the agency contact list.',
				backTo: '/public-engagement/contacts',
				backLabel: 'Contacts',
			}}
			onSave={onSave}
			submitLabel="Create contact"
		/>
	);
}
