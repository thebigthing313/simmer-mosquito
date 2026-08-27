import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { newRecordId } from '../../../hooks/mutations/shared';
import { useContactMutations } from '../../../hooks/mutations/use-contact-mutations';
import { useContact } from '../../../hooks/queries/use-contact-record';
import { isBelowRole } from '../../../lib/write-access';
import {
	type ContactFormValues,
	contactFieldsFromValues,
	defaultContactFormValues,
} from '../-contact-fields';
import { ContactFormPage } from './-contact-form';

export const Route = createFileRoute('/public-engagement/contacts/create')({
	beforeLoad: async ({ context }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({ replace: true, to: '/public-engagement/contacts' });
		}
	},
	component: CreateContactRoute,
});

function CreateContactRoute() {
	const navigate = useNavigate();
	const mutations = useContactMutations();

	// Minted up front, and queried before it exists: `contacts` is on-demand, and
	// a write into a collection nothing is querying waits out a txid confirmation
	// that never arrives — which reads as a frozen save rather than a slow one.
	const [contactId] = useState(() => newRecordId());
	useContact(contactId);

	const onSave = useCallback(
		async (values: ContactFormValues) => {
			await mutations.create(contactId, contactFieldsFromValues(values));
			await navigate({ to: '/public-engagement/contacts/$id', params: { id: contactId } });
		},
		[contactId, mutations, navigate],
	);

	return (
		<ContactFormPage
			canSubmit={mutations.canWrite}
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
