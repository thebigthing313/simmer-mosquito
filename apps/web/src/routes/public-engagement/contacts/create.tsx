import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { createLabel } from '../../../components/app-shell/navigation';
import {
	type ContactFormValues,
	contactFieldsFromValues,
	defaultContactFormValues,
} from '../../../components/public-engagement/contact-fields';
import { ContactFormPage } from '../../../components/public-engagement/contacts/contact-form';
import { newRecordId } from '../../../hooks/mutations/shared';
import { useContactMutations } from '../../../hooks/mutations/use-contact-mutations';
import { useContact } from '../../../hooks/queries/use-contact-record';
import { recordNoun } from '../../../lib/record-nouns';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';

export const Route = createFileRoute('/public-engagement/contacts/create')({
	beforeLoad: async ({ context }) => {
		if (await isBelowWriteFloor(context, '/public-engagement/contacts/create')) {
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

	const onSave = async (values: ContactFormValues) => {
		await mutations.create(contactId, contactFieldsFromValues(values));
		await navigate({ to: '/public-engagement/contacts/$id', params: { id: contactId } });
	};

	return (
		<ContactFormPage
			canSubmit={mutations.canWrite}
			defaultValues={defaultContactFormValues()}
			header={{
				title: createLabel('contact'),
				backTo: '/public-engagement/contacts',
				backLabel: recordNoun('contact').titleMany,
			}}
			onSave={onSave}
		/>
	);
}
