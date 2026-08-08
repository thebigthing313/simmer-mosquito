import { geojsonToGeom, localDateColumn, softDelete, updateRow } from '@simmer-mosquito/db';
import type { PublicEngagementCommand } from '@simmer-mosquito/domain';
import type { MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import {
	agencyCommandContext,
	type CommandContext,
	CommandError,
	commandEndpoint,
	createCommand,
	handleCommandError,
	invalidUpdate,
	type CommandsResult as SharedCommandsResult,
} from '../command-endpoint.js';
import { isRecord, readNullableText, readText } from '../command-payload.js';
import {
	type CommandDb,
	type CommandTransaction,
	commandActor,
	readDate,
	readNumberOrNull,
	readStringArray,
	writeCommands,
} from '../command-write.js';

export type PublicEngagementDb = CommandDb;
export type PublicEngagementTransaction = CommandTransaction;
export {
	agencyCommandContext,
	type CommandContext,
	commandActor,
	commandEndpoint,
	createCommand,
	geojsonToGeom,
	handleCommandError,
	invalidUpdate,
	localDateColumn,
	readDate,
	readNumberOrNull,
	readStringArray,
	softDelete,
	updateRow,
	writeCommands,
};

export type ContactReference =
	| { readonly kind: 'existing'; readonly contactId: string }
	| { readonly kind: 'new'; readonly contactId: string; readonly details: ContactDetails };

export interface ContactDetails {
	readonly contactName: string | null;
	readonly preferredPhone: string | null;
	readonly alternatePhone: string | null;
	readonly email: string | null;
	readonly company: string | null;
	readonly department: string | null;
	readonly title: string | null;
	readonly wantsEmail: boolean;
	readonly wantsSms: boolean;
	readonly wantsPhone: boolean;
}

export interface InlineAddressDetails {
	readonly displayName: string;
	readonly geometry: unknown;
	readonly country: string;
	readonly addressLine1: string | null;
	readonly addressLine2: string | null;
	readonly locality: string | null;
	readonly region: string | null;
	readonly postalCode: string | null;
	readonly geocoderResponse: unknown | null;
}

export async function insertContact(
	trx: PublicEngagementTransaction,
	organizationId: string,
	contactId: string,
	details: ContactDetails,
	actorProfileId: string,
): Promise<SafeContact> {
	const row = await trx
		.insertInto('contacts')
		.values({
			id: contactId,
			organization_id: organizationId,
			contact_name: details.contactName,
			preferred_phone: details.preferredPhone,
			alternate_phone: details.alternatePhone,
			email: details.email,
			company: details.company,
			department: details.department,
			title: details.title,
			wants_email: details.wantsEmail,
			wants_sms: details.wantsSms,
			wants_phone: details.wantsPhone,
			created_by_profile_id: actorProfileId,
			updated_by_profile_id: actorProfileId,
		})
		.returning(contactReturnColumns)
		.executeTakeFirstOrThrow();
	return toSafeContact(row);
}

export async function insertRegistrationType(
	trx: PublicEngagementTransaction,
	organizationId: string,
	notificationRegistrationTypeId: string,
	notificationRegistrationId: string,
	notificationTypeId: string,
	actorProfileId: string,
): Promise<SafeRegistrationType> {
	const row = await trx
		.insertInto('notification_registration_types')
		.values({
			id: notificationRegistrationTypeId,
			organization_id: organizationId,
			notification_registration_id: notificationRegistrationId,
			notification_type_id: notificationTypeId,
			created_by_profile_id: actorProfileId,
			updated_by_profile_id: actorProfileId,
		})
		.returning(registrationTypeReturnColumns)
		.executeTakeFirstOrThrow();
	return toSafeRegistrationType(row);
}

// ===========================================================================
// Inline contact / address resolution
// ===========================================================================

export async function resolveContact(
	trx: PublicEngagementTransaction,
	organizationId: string,
	contact: ContactReference,
	actorProfileId: string,
): Promise<string> {
	if (contact.kind === 'new') {
		await insertContact(trx, organizationId, contact.contactId, contact.details, actorProfileId);
		return contact.contactId;
	}
	return contact.contactId;
}

export type AddressReference =
	| { readonly kind: 'none' }
	| { readonly kind: 'existing'; readonly addressId: string }
	| { readonly kind: 'new'; readonly addressId: string; readonly details: InlineAddressDetails };

export async function resolveServiceRequestAddress(
	trx: PublicEngagementTransaction,
	organizationId: string,
	address: AddressReference,
	actorProfileId: string,
): Promise<string> {
	if (address.kind === 'new') {
		await insertAddress(trx, organizationId, address.addressId, address.details, actorProfileId);
		return address.addressId;
	}
	if (address.kind === 'existing') {
		return address.addressId;
	}
	throw new CommandError(400, { error: 'service_request_address_required' });
}

export async function resolveNotificationAddress(
	trx: PublicEngagementTransaction,
	organizationId: string,
	address: AddressReference,
	actorProfileId: string,
): Promise<string | null> {
	if (address.kind === 'new') {
		await insertAddress(trx, organizationId, address.addressId, address.details, actorProfileId);
		return address.addressId;
	}
	if (address.kind === 'existing') {
		return address.addressId;
	}
	return null;
}

async function insertAddress(
	trx: PublicEngagementTransaction,
	organizationId: string,
	addressId: string,
	details: InlineAddressDetails,
	actorProfileId: string,
): Promise<void> {
	await trx
		.insertInto('addresses')
		.values({
			id: addressId,
			organization_id: organizationId,
			geom: geojsonToGeom(details.geometry),
			display_name: details.displayName,
			country: details.country,
			address_line_1: details.addressLine1,
			address_line_2: details.addressLine2,
			locality: details.locality,
			region: details.region,
			postal_code: details.postalCode,
			geocoder_response: details.geocoderResponse,
			created_by_profile_id: actorProfileId,
			updated_by_profile_id: actorProfileId,
		})
		.execute();
}

// ===========================================================================
// Response shaping
// ===========================================================================

export const contactReturnColumns = [
	'id',
	'organization_id',
	'contact_name',
	'preferred_phone',
	'alternate_phone',
	'email',
	'company',
	'department',
	'title',
	'wants_email',
	'wants_sms',
	'wants_phone',
	'created_at',
	'updated_at',
] as const;

export interface SafeContact {
	readonly id: string;
	readonly organizationId: string;
	readonly contactName: string | null;
	readonly email: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeContact(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly contact_name: string | null;
	readonly email: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeContact {
	return {
		id: row.id,
		organizationId: row.organization_id,
		contactName: row.contact_name,
		email: row.email,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export const serviceRequestReturnColumns = [
	'id',
	'organization_id',
	'intake_type',
	'address_id',
	'contact_id',
	'closed_at',
	'created_at',
	'updated_at',
] as const;

export interface SafeServiceRequest {
	readonly id: string;
	readonly organizationId: string;
	readonly contactId: string;
	readonly addressId: string;
	readonly closedAt: Date | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeServiceRequest(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly contact_id: string;
	readonly address_id: string;
	readonly closed_at: Date | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeServiceRequest {
	return {
		id: row.id,
		organizationId: row.organization_id,
		contactId: row.contact_id,
		addressId: row.address_id,
		closedAt: row.closed_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export const registrationReturnColumns = [
	'id',
	'organization_id',
	'contact_id',
	'address_id',
	'buffer_distance',
	'buffer_unit_id',
	'has_bees',
	'is_no_spray',
	'is_active',
	'created_at',
	'updated_at',
] as const;

export interface SafeRegistration {
	readonly id: string;
	readonly organizationId: string;
	readonly contactId: string;
	readonly isActive: boolean;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeRegistration(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly contact_id: string;
	readonly is_active: boolean;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeRegistration {
	return {
		id: row.id,
		organizationId: row.organization_id,
		contactId: row.contact_id,
		isActive: row.is_active,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export const registrationTypeReturnColumns = [
	'id',
	'organization_id',
	'notification_registration_id',
	'notification_type_id',
	'created_at',
	'updated_at',
] as const;

export interface SafeRegistrationType {
	readonly id: string;
	readonly organizationId: string;
	readonly notificationRegistrationId: string;
	readonly notificationTypeId: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeRegistrationType(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly notification_registration_id: string;
	readonly notification_type_id: string;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeRegistrationType {
	return {
		id: row.id,
		organizationId: row.organization_id,
		notificationRegistrationId: row.notification_registration_id,
		notificationTypeId: row.notification_type_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export const missionNotificationReturnColumns = [
	'id',
	'organization_id',
	'mission_id',
	'status',
	'status_changed_at',
	'created_at',
	'updated_at',
] as const;

export interface SafeMissionNotification {
	readonly id: string;
	readonly organizationId: string;
	readonly missionId: string;
	readonly status: string;
	readonly statusChangedAt: Date | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeMissionNotification(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly mission_id: string;
	readonly status: string;
	readonly status_changed_at: Date | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeMissionNotification {
	return {
		id: row.id,
		organizationId: row.organization_id,
		missionId: row.mission_id,
		status: row.status,
		statusChangedAt: row.status_changed_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

// ===========================================================================
// Shared command + request helpers
// ===========================================================================

export interface RouteOptions {
	readonly db: PublicEngagementDb;
	readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
}

export type CommandsResult = SharedCommandsResult<PublicEngagementCommand>;

export function readContactDetails(payload: Record<string, unknown>) {
	return {
		contactName: readNullableText(payload.contactName),
		preferredPhone: readNullableText(payload.preferredPhone),
		alternatePhone: readNullableText(payload.alternatePhone),
		email: readNullableText(payload.email),
		company: readNullableText(payload.company),
		department: readNullableText(payload.department),
		title: readNullableText(payload.title),
		wantsEmail: payload.wantsEmail === true,
		wantsSms: payload.wantsSms === true,
		wantsPhone: payload.wantsPhone === true,
	};
}

export function readSubscriptions(value: unknown): readonly {
	readonly notificationRegistrationTypeId: string;
	readonly notificationTypeId: string;
}[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.map((entry) => ({
		notificationRegistrationTypeId: isRecord(entry)
			? (readText(entry.notificationRegistrationTypeId) ?? '')
			: '',
		notificationTypeId: isRecord(entry) ? (readText(entry.notificationTypeId) ?? '') : '',
	}));
}
