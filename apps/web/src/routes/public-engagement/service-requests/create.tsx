import { isOwnedGeometry } from '@simmer-mosquito/domain';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { createLabel } from '../../../components/app-shell/navigation';
import { mapPointSearchSchema, pointFromSearch } from '../../../components/map';
import { contactFieldsFromValues } from '../../../components/public-engagement/contact-fields';
import {
	ServiceRequestFormPage,
	type ServiceRequestSaveInput,
} from '../../../components/public-engagement/service-requests/service-request-form';
import {
	defaultServiceRequestFormValues,
	serviceRequestFieldsFrom,
} from '../../../components/public-engagement/service-requests/service-request-form-values';
import { newRecordId } from '../../../hooks/mutations/shared';
import { useContactMutations } from '../../../hooks/mutations/use-contact-mutations';
import { useServiceRequestMutations } from '../../../hooks/mutations/use-service-request-mutations';
import { useContact } from '../../../hooks/queries/use-contact-record';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useServiceRequestRecord } from '../../../hooks/queries/use-service-request-record';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { todayInTimeZone } from '../../../lib/local-date';
import { recordNoun } from '../../../lib/record-nouns';
import {
	addressSeedSearchSchema,
	contactSeedSearchSchema,
	seededValues,
} from '../../../lib/record-seed-search';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';

export const Route = createFileRoute('/public-engagement/service-requests/create')({
	// Ahead of `beforeLoad`: the options object is read in order, and a guard
	// declared first is typed against a route whose search schema is not known
	// yet — which erases lat/lng from `Route.useSearch()`.
	validateSearch: (search) => ({
		...mapPointSearchSchema.parse(search),
		...addressSeedSearchSchema.parse(search),
		...contactSeedSearchSchema.parse(search),
	}),
	beforeLoad: async ({ context }) => {
		if (await isBelowWriteFloor(context, '/public-engagement/service-requests/create')) {
			throw redirect({ replace: true, to: '/public-engagement/service-requests' });
		}
	},
	component: CreateServiceRequestRoute,
});

function CreateServiceRequestRoute() {
	const { auth } = Route.useRouteContext();
	const search = Route.useSearch();
	const initialGeometry = pointFromSearch(search);
	const navigate = useNavigate();
	const profiles = useProfileRoster();
	const contactWrites = useContactMutations();
	const requestWrites = useServiceRequestMutations();

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	// The day the public reported it is an operational date, so it is the
	// organization's day rather than the browser's — an intake taker keying in a
	// call at 11pm files it under the day the organization is still working.
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);

	// Both ids are minted up front and both rows are queried before either exists:
	// `contacts` and `service_requests` are on-demand, and a write into a
	// collection nothing is querying waits out a txid confirmation that never
	// arrives — which reads as a frozen save rather than a slow one.
	const [requestId] = useState(() => newRecordId());
	const [contactId] = useState(() => newRecordId());
	useServiceRequestRecord(requestId);
	useContact(contactId);

	const onSave = async ({ values, geometry }: ServiceRequestSaveInput) => {
		if (geometry === null || !isOwnedGeometry('serviceRequest', geometry)) {
			throw new Error('Place the request location on the map.');
		}

		// 1. The new contact, if this is one — written first, so the request that
		//    names it references a row that exists.
		let requestContactId = values.contactId;
		if (values.contactMode === 'new') {
			await contactWrites.create(contactId, contactFieldsFromValues(values.newContact));
			requestContactId = contactId;
		}
		if (requestContactId === null) {
			throw new Error('Select or create a contact for this request.');
		}

		// 2. The address is always an existing row: new ones are created by the
		//    picker's own inline form, which commits before handing back the id.
		const addressId = values.addressId;
		if (addressId === null) {
			throw new Error('Select or create an address for this request.');
		}

		await requestWrites.record({
			requestId,
			fields: serviceRequestFieldsFrom(values),
			contactId: requestContactId,
			addressId,
			geometry,
		});
		await navigate({
			to: '/public-engagement/service-requests/$id',
			params: { id: requestId },
		});
	};

	return (
		<ServiceRequestFormPage
			canSubmit={contactWrites.canWrite && requestWrites.canWrite}
			defaultValues={{
				...defaultServiceRequestFormValues(today, actorProfileId ?? ''),
				...seededValues({ addressId: search.addressId, contactId: search.contactId }),
			}}
			header={{
				title: createLabel('serviceRequest'),
				description:
					'Log a request from the public. Link or create a contact and address, then place its location.',
				backTo: '/public-engagement/service-requests',
				backLabel: recordNoun('serviceRequest').titleMany,
			}}
			initialGeometry={initialGeometry}
			onSave={onSave}
			profiles={profiles}
		/>
	);
}
