import type { ContactRow } from '@simmer-mosquito/sync';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { RecordUnavailable } from '../../../components/record';
import { isBelowRole } from '../../../lib/write-access';
import { webCollections } from '../../../sync/webCollections';
import {
	type ContactFormValues,
	contactFieldsFromValues,
	defaultsFromContact,
} from '../-contact-fields';
import { settleWrite } from '../-public-engagement-writes';
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

const contactGcTimeMs = 30_000;

type MutableContactRow = { -readonly [Key in keyof ContactRow]: ContactRow[Key] };

function EditContactRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();

	// contacts syncs on demand; this status-gated query loads the row and warms the
	// stream so the update's txid confirmation resolves.
	const result = useLiveQuery(
		{
			gcTime: contactGcTimeMs,
			query: (query) =>
				query
					.from({ contact: webCollections.contacts })
					.where(({ contact }) => eq(contact.id, id))
					.findOne(),
		},
		[id],
	);
	const contact = result.data as ContactRow | undefined;

	if (result.isError) {
		return <RecordUnavailable layout="centered" noun="contact" reason="error" />;
	}
	if (!result.isReady) {
		return <EditFormSkeleton />;
	}
	if (contact === undefined) {
		return <RecordUnavailable layout="centered" noun="contact" reason="not-found" />;
	}

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	return (
		<EditContactLoader
			actorProfileId={actorProfileId}
			canSubmit={actorProfileId !== null}
			contact={contact}
		/>
	);
}

function EditContactLoader({
	contact,
	actorProfileId,
	canSubmit,
}: {
	readonly contact: ContactRow;
	readonly actorProfileId: string | null;
	readonly canSubmit: boolean;
}) {
	const navigate = useNavigate();

	const onSave = useCallback(
		async (values: ContactFormValues) => {
			const fields = contactFieldsFromValues(values);
			const now = new Date().toISOString();
			const applyEdits = (draft: ContactRow) => {
				const writable = draft as MutableContactRow;
				writable.contactName = fields.contactName;
				writable.company = fields.company;
				writable.department = fields.department;
				writable.title = fields.title;
				writable.preferredPhone = fields.preferredPhone;
				writable.alternatePhone = fields.alternatePhone;
				writable.email = fields.email;
				writable.wantsEmail = fields.wantsEmail;
				writable.wantsSms = fields.wantsSms;
				writable.wantsPhone = fields.wantsPhone;
				if (actorProfileId !== null) {
					writable.updatedByProfileId = actorProfileId;
				}
				writable.updatedAt = now;
			};

			await settleWrite(webCollections.contacts.update(contact.id, applyEdits));
			await navigate({ to: '/public-engagement/contacts/$id', params: { id: contact.id } });
		},
		[contact.id, actorProfileId, navigate],
	);

	return (
		<ContactFormPage
			canSubmit={canSubmit}
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

function EditFormSkeleton() {
	return (
		<OutletSimpleLayout>
			<div className="grid max-w-[640px] gap-5">
				<Skeleton className="h-6 w-40" />
				<Skeleton className="h-9 w-full" />
				<div className="grid grid-cols-2 gap-4">
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-9 w-full" />
				</div>
				<Skeleton className="h-9 w-full" />
				<Skeleton className="h-24 w-full" />
			</div>
		</OutletSimpleLayout>
	);
}
