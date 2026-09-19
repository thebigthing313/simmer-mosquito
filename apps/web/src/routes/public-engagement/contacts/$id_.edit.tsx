import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { OutletSimpleLayout } from '../../../components/app-shell';
import {
	type ContactFormValues,
	contactFieldsFromValues,
	defaultsFromContact,
} from '../../../components/public-engagement/contact-fields';
import { ContactFormPage } from '../../../components/public-engagement/contacts/contact-form';
import { EditFormSkeleton, RecordEditFrame } from '../../../components/record';
import { useContactMutations } from '../../../hooks/mutations/use-contact-mutations';
import type { Contact } from '../../../hooks/queries/contact-view';
import { useContact } from '../../../hooks/queries/use-contact-record';
import { recordNoun } from '../../../lib/record-nouns';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';

export const Route = createFileRoute('/public-engagement/contacts/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowWriteFloor(context, '/public-engagement/contacts/$id/edit')) {
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

	return (
		<RecordEditFrame
			recordType="contact"
			reading={{ isError, isReady, record: contact }}
			skeleton={
				// `record` is the measure the index and the route-loading skeleton draw
				// in, so the wait for the record does not jump the column (#1043, #1047).
				<OutletSimpleLayout measure="record">
					<EditFormSkeleton
						className="max-w-[640px]"
						frame="plain"
						rows={['h-9', ['h-9', 'h-9'], 'h-9', 'h-24']}
					/>
				</OutletSimpleLayout>
			}
		>
			{(record) => <EditContactLoader contact={record} />}
		</RecordEditFrame>
	);
}

function EditContactLoader({ contact }: { readonly contact: Contact }) {
	const navigate = useNavigate();
	const mutations = useContactMutations();

	const onSave = async (values: ContactFormValues) => {
		// `current` comes back through the same round trip as the edited values,
		// so a field nobody touched compares equal to itself and the save names
		// only the command it has a changed field for.
		await mutations.save(
			contact.id,
			contactFieldsFromValues(values),
			contactFieldsFromValues(defaultsFromContact(contact)),
		);
		await navigate({ to: '/public-engagement/contacts/$id', params: { id: contact.id } });
	};

	return (
		<ContactFormPage
			canSubmit={mutations.canWrite}
			defaultValues={defaultsFromContact(contact)}
			header={{
				title: `Edit ${recordNoun('contact').title}`,
				description: 'Update this contact’s identity, communication, or preferences.',
				backTo: '/public-engagement/contacts/$id',
				backParams: { id: contact.id },
				backLabel: 'Back to Contact',
			}}
			onSave={onSave}
		/>
	);
}
