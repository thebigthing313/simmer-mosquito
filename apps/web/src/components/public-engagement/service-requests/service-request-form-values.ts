import { createServiceRequestCommand, type RequestIntakeType } from '@simmer-mosquito/domain';
import type { DrawGeometry } from '../../../hooks/map/use-map-draw';
import type { ServiceRequestFields } from '../../../hooks/mutations/use-service-request-mutations';
import {
	domainValidator,
	FORM_VALIDATION_CONTEXT,
	FORM_VALIDATION_GEOMETRY,
} from '../../../lib/domain-validation';
import {
	CONTACT_FIELD_PATHS,
	type ContactFormValues,
	defaultContactFormValues,
} from '../contact-fields';

export type ContactMode = 'existing' | 'new';

/**
 * The form's values, as the write seam takes them. An unset "received by" is
 * the empty string in a select and `null` in the column.
 */
export function serviceRequestFieldsFrom(values: ServiceRequestFormValues): ServiceRequestFields {
	return {
		intakeType: values.intakeType,
		requestDate: values.requestDate,
		details: values.details.trim(),
		receivedByProfileId:
			values.receivedByProfileId.length === 0 ? null : values.receivedByProfileId,
	};
}

export interface ServiceRequestFormValues {
	readonly intakeType: RequestIntakeType;
	readonly requestDate: string;
	readonly details: string;
	/** A profile id; defaults to the acting user. */
	readonly receivedByProfileId: string;
	readonly contactMode: ContactMode;
	readonly contactId: string | null;
	/** The inline "new contact" subform, the same fields the contact page owns. */
	readonly newContact: ContactFormValues;
	readonly addressId: string | null;
}

/**
 * Domain issue path to the form field holding it. The inline contact subform
 * nests under `contact.details`, matching the shape the builder validates.
 */
const SERVICE_REQUEST_FIELD_PATHS: Readonly<Record<string, string>> = {
	intakeType: 'intakeType',
	requestDate: 'requestDate',
	details: 'details',
	receivedByProfileId: 'receivedByProfileId',
	'contact.contactId': 'contactId',
	'location.address.addressId': 'addressId',
	...Object.fromEntries(
		CONTACT_FIELD_PATHS.map((field) => [`contact.details.${field}`, `newContact.${field}`]),
	),
};

/**
 * The form's rules, straight from the domain builder: intake type, date,
 * details, and whichever of the contact/address subforms is in play. The edit
 * page does not own the point, so it is handed the stand-in and the builder
 * reports on everything else.
 */
export function validateServiceRequest(
	value: ServiceRequestFormValues,
	geometry: DrawGeometry | null,
	options: { readonly hideLocation: boolean; readonly disableNewContact: boolean },
) {
	const existingContact = value.contactMode === 'existing' || options.disableNewContact;
	return domainValidator(
		() =>
			createServiceRequestCommand({
				...FORM_VALIDATION_CONTEXT,
				serviceRequestId: FORM_VALIDATION_CONTEXT.organizationId,
				intakeType: value.intakeType,
				requestDate: value.requestDate,
				details: value.details,
				receivedByProfileId: value.receivedByProfileId === '' ? null : value.receivedByProfileId,
				contact: existingContact
					? { kind: 'existing', contactId: value.contactId ?? '' }
					: {
							kind: 'new',
							contactId: FORM_VALIDATION_CONTEXT.organizationId,
							details: value.newContact,
						},
				location: {
					geometry: (options.hideLocation ? FORM_VALIDATION_GEOMETRY : (geometry ?? null)) as never,
					address: { kind: 'existing', addressId: value.addressId ?? '' },
				},
			}),
		SERVICE_REQUEST_FIELD_PATHS,
	)({ value });
}

export function defaultServiceRequestFormValues(
	today: string,
	receivedByProfileId: string,
): ServiceRequestFormValues {
	return {
		intakeType: 'phone',
		requestDate: today,
		details: '',
		receivedByProfileId,
		contactMode: 'existing',
		contactId: null,
		newContact: defaultContactFormValues(),
		addressId: null,
	};
}
