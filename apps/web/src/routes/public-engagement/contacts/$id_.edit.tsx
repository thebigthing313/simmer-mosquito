import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { EditFormSkeleton, RecordUnavailable } from '../../../components/record';
import { useContactMutations } from '../../../hooks/mutations/use-contact-mutations';
import type { Contact } from '../../../hooks/queries/contact-view';
import { useContact } from '../../../hooks/queries/use-contact-record';
import { isBelowRole } from '../../../lib/write-access';
import {
	type ContactFormValues,
	contactFieldsFromValues,
	defaultsFromContact,
} from '../-contact-fields';
import { ContactFormPage } from './-contact-form';

export const Route = createFileRoute('/public-engagement/contacts/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/public-engagement/contacts/$id',
			});
		}
	},
	component: EditContactRoute,
});

function EditContactRoute() {
	const { id } = Route.useParams();
	const { contact, isReady, isError } = useContact(id);

	if (isError) {
		return <RecordUnavailable layout="centered" noun="contact" reason="error" />;
	}
	if (!isReady) {
		return (
			<OutletSimpleLayout>
				<EditFormSkeleton
					className="max-w-[640px]"
					frame="plain"
					rows={['h-9', ['h-9', 'h-9'], 'h-9', 'h-24']}
				/>
			</OutletSimpleLayout>
		);
	}
	if (contact === undefined) {
		return <RecordUnavailable layout="centered" noun="contact" reason="not-found" />;
	}

	return <EditContactLoader contact={contact} />;
}

function EditContactLoader({ contact }: { readonly contact: Contact }) {
	const navigate = useNavigate();
	const mutations = useContactMutations();

	const onSave = useCallback(
		async (values: ContactFormValues) => {
			// `current` comes back through the same round trip as the edited values,
			// so a field nobody touched compares equal to itself and the save names
			// only the command it has a changed field for.
			await mutations.save(
				contact.id,
				contactFieldsFromValues(values),
				contactFieldsFromValues(defaultsFromContact(contact)),
			);
			await navigate({ to: '/public-engagement/contacts/$id', params: { id: contact.id } });
		},
		[contact, mutations, navigate],
	);

	return (
		<ContactFormPage
			canSubmit={mutations.canWrite}
			defaultValues={defaultsFromContact(contact)}
			header={{
				title: 'Edit Contact',
				description: 'Update this contact’s identity, communication, or preferences.',
				backTo: '/public-engagement/contacts/$id',
				backParams: { id: contact.id },
				backLabel: 'Back to Contact',
			}}
			onSave={onSave}
			submitLabel="Save Changes"
		/>
	);
}
