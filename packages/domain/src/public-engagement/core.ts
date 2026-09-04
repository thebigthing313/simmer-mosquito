import {
	createIssues,
	jsonObject as normalizeJsonObject,
	nullableText as normalizeNullableText,
	optionalId as normalizeOptionalId,
	optionalUuid as normalizeOptionalUuid,
	requiredId as normalizeRequiredId,
	requiredText as normalizeRequiredText,
	requiredUuid as requireUuid,
	validateAgencyCommandContext,
} from '../command-validation.js';
import {
	type DomainId,
	DomainValidationError,
	type DomainValidationIssue,
	type GeoJsonPoint,
	type JsonObject,
	normalizeOwnedGeometry,
	type SupportedGeoJsonGeometry,
} from '../shared.js';

export type RequestIntakeType = 'online' | 'phone' | 'walk-in' | 'other';
export type NotificationChannel = 'email' | 'sms' | 'phone';
export type MissionNotificationStatus = 'pending' | 'completed' | 'failed' | 'skipped';
export type NotificationRegistrationGeometry = SupportedGeoJsonGeometry;

export type PublicEngagementCommandType =
	| 'publicEngagement.createContact'
	| 'publicEngagement.updateContactDetails'
	| 'publicEngagement.updateContactCommunication'
	| 'publicEngagement.mergeContacts'
	| 'publicEngagement.deleteContact'
	| 'publicEngagement.createServiceRequest'
	| 'publicEngagement.updateServiceRequestDetails'
	| 'publicEngagement.updateServiceRequestContact'
	| 'publicEngagement.updateServiceRequestLocation'
	| 'publicEngagement.closeServiceRequest'
	| 'publicEngagement.reopenServiceRequest'
	| 'publicEngagement.deleteServiceRequest'
	| 'publicEngagement.createNotificationType'
	| 'publicEngagement.updateNotificationType'
	| 'publicEngagement.deactivateNotificationType'
	| 'publicEngagement.reactivateNotificationType'
	| 'publicEngagement.deleteNotificationType'
	| 'publicEngagement.createNotificationRegistration'
	| 'publicEngagement.updateNotificationRegistrationContact'
	| 'publicEngagement.updateNotificationRegistrationLocation'
	| 'publicEngagement.updateNotificationRegistrationBuffer'
	| 'publicEngagement.updateNotificationRegistrationFlags'
	| 'publicEngagement.deactivateNotificationRegistration'
	| 'publicEngagement.reactivateNotificationRegistration'
	| 'publicEngagement.deleteNotificationRegistration'
	| 'publicEngagement.subscribeNotificationRegistrationType'
	| 'publicEngagement.unsubscribeNotificationRegistrationType'
	| 'publicEngagement.generateMissionNotifications'
	| 'publicEngagement.completeMissionNotification'
	| 'publicEngagement.failMissionNotification'
	| 'publicEngagement.skipMissionNotification'
	| 'publicEngagement.reopenMissionNotification';

export interface PublicEngagementDomainCommand<
	TType extends PublicEngagementCommandType,
	TPayload,
> {
	readonly type: TType;
	readonly payload: TPayload;
}

export interface PublicEngagementCommandInput {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface PublicEngagementCommandPayload {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface CreateContactDetailsInput {
	readonly contactName?: string | null;
	readonly preferredPhone?: string | null;
	readonly alternatePhone?: string | null;
	readonly email?: string | null;
	readonly company?: string | null;
	readonly department?: string | null;
	readonly title?: string | null;
	readonly wantsEmail?: boolean;
	readonly wantsSms?: boolean;
	readonly wantsPhone?: boolean;
}

export interface CreateContactDetails {
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

export interface CreateInlineAddressDetailsInput {
	readonly displayName: string;
	readonly geometry: unknown;
	readonly country?: string | null;
	readonly addressLine1?: string | null;
	readonly addressLine2?: string | null;
	readonly locality?: string | null;
	readonly region?: string | null;
	readonly postalCode?: string | null;
	readonly geocoderResponse?: unknown | null;
}

export interface CreateInlineAddressDetails {
	readonly displayName: string;
	readonly geometry: GeoJsonPoint;
	readonly country: 'US';
	readonly addressLine1: string | null;
	readonly addressLine2: string | null;
	readonly locality: string | null;
	readonly region: string | null;
	readonly postalCode: string | null;
	readonly geocoderResponse: JsonObject | null;
}

export type ContactReferenceInput =
	| { readonly kind: 'existing'; readonly contactId: DomainId }
	| {
			readonly kind: 'new';
			readonly contactId: DomainId;
			readonly details: CreateContactDetailsInput;
	  };

export type ContactReference =
	| { readonly kind: 'existing'; readonly contactId: DomainId }
	| { readonly kind: 'new'; readonly contactId: DomainId; readonly details: CreateContactDetails };

export type ServiceRequestAddressInput =
	| { readonly kind: 'existing'; readonly addressId: DomainId }
	| {
			readonly kind: 'new';
			readonly addressId: DomainId;
			readonly details: CreateInlineAddressDetailsInput;
	  };

export type ServiceRequestAddress =
	| { readonly kind: 'existing'; readonly addressId: DomainId }
	| {
			readonly kind: 'new';
			readonly addressId: DomainId;
			readonly details: CreateInlineAddressDetails;
	  };

export type NotificationRegistrationAddressInput =
	| { readonly kind: 'none' }
	| { readonly kind: 'existing'; readonly addressId: DomainId }
	| {
			readonly kind: 'new';
			readonly addressId: DomainId;
			readonly details: CreateInlineAddressDetailsInput;
	  };

export type NotificationRegistrationAddress =
	| { readonly kind: 'none' }
	| { readonly kind: 'existing'; readonly addressId: DomainId }
	| {
			readonly kind: 'new';
			readonly addressId: DomainId;
			readonly details: CreateInlineAddressDetails;
	  };

export interface ServiceRequestLocationInput {
	readonly address: ServiceRequestAddressInput;
	readonly geometry: unknown;
}

export interface ServiceRequestLocation {
	readonly address: ServiceRequestAddress;
	readonly geometry: GeoJsonPoint;
}

export interface NotificationRegistrationLocationInput {
	readonly address?: NotificationRegistrationAddressInput;
	readonly geometry: unknown;
}

export interface NotificationRegistrationLocation {
	readonly address: NotificationRegistrationAddress;
	readonly geometry: NotificationRegistrationGeometry;
}

export interface NotificationRegistrationSubscriptionInput {
	readonly notificationRegistrationTypeId: DomainId;
	readonly notificationTypeId: DomainId;
}

export interface NotificationRegistrationSubscription {
	readonly notificationRegistrationTypeId: DomainId;
	readonly notificationTypeId: DomainId;
}

export const REQUEST_INTAKE_TYPES = ['online', 'phone', 'walk-in', 'other'] as const;
export const NOTIFICATION_CHANNELS = ['email', 'sms', 'phone'] as const;
export const MISSION_NOTIFICATION_STATUSES = ['pending', 'completed', 'failed', 'skipped'] as const;

export function validateBase(
	input: PublicEngagementCommandInput,
	issues: DomainValidationIssue[],
): void {
	validateAgencyCommandContext(input, issues);
}

export function validateIdCommand<T extends PublicEngagementCommandInput>(
	input: T,
	idKey: keyof T & string,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input[idKey] as string | undefined, idKey, issues);
	return issues;
}

export function basePayload(input: PublicEngagementCommandInput): PublicEngagementCommandPayload {
	return validateAgencyCommandContext(input, createIssues());
}

export function validateContactReference(
	input: ContactReferenceInput,
	path: string,
	issues: DomainValidationIssue[],
): ContactReference {
	if (!isRecord(input)) {
		issues.push({ path, message: `${path} must be a contact reference.` });
		return { kind: 'existing', contactId: '' };
	}
	if (input.kind === 'existing') {
		requireUuid(input.contactId, `${path}.contactId`, issues);
		return { kind: 'existing', contactId: normalizeRequiredId(input.contactId) };
	}
	if (input.kind === 'new') {
		requireUuid(input.contactId, `${path}.contactId`, issues);
		const details = normalizeCreateContactDetails(input.details, `${path}.details`, issues);
		return { kind: 'new', contactId: normalizeRequiredId(input.contactId), details };
	}
	issues.push({ path: `${path}.kind`, message: `${path}.kind is not supported.` });
	return { kind: 'existing', contactId: '' };
}

export function validateServiceRequestLocation(
	input: ServiceRequestLocationInput,
	path: string,
	issues: DomainValidationIssue[],
): ServiceRequestLocation {
	if (!isRecord(input)) {
		issues.push({ path, message: `${path} must be a service request location.` });
		return {
			address: { kind: 'existing', addressId: '' },
			geometry: { type: 'Point', coordinates: [0, 0] },
		};
	}
	return {
		address: validateServiceRequestAddress(input.address, `${path}.address`, issues),
		geometry: validatePointGeometry(input.geometry, `${path}.geometry`, issues),
	};
}

function validateServiceRequestAddress(
	input: ServiceRequestAddressInput,
	path: string,
	issues: DomainValidationIssue[],
): ServiceRequestAddress {
	if (!isRecord(input)) {
		issues.push({ path, message: `${path} must be an address reference.` });
		return { kind: 'existing', addressId: '' };
	}
	if (input.kind === 'existing') {
		requireUuid(input.addressId, `${path}.addressId`, issues);
		return { kind: 'existing', addressId: normalizeRequiredId(input.addressId) };
	}
	if (input.kind === 'new') {
		requireUuid(input.addressId, `${path}.addressId`, issues);
		const details = normalizeInlineAddressDetails(input.details, `${path}.details`, issues);
		return { kind: 'new', addressId: normalizeRequiredId(input.addressId), details };
	}
	issues.push({ path: `${path}.kind`, message: `${path}.kind is not supported.` });
	return { kind: 'existing', addressId: '' };
}

export function validateNotificationRegistrationLocation(
	input: NotificationRegistrationLocationInput,
	path: string,
	issues: DomainValidationIssue[],
): NotificationRegistrationLocation {
	if (!isRecord(input)) {
		issues.push({ path, message: `${path} must be a notification registration location.` });
		return { address: { kind: 'none' }, geometry: { type: 'Point', coordinates: [0, 0] } };
	}
	return {
		address: validateNotificationAddress(
			input.address ?? { kind: 'none' },
			`${path}.address`,
			issues,
		),
		geometry: validateRegistrationGeometry(input.geometry, `${path}.geometry`, issues),
	};
}

function validateNotificationAddress(
	input: NotificationRegistrationAddressInput,
	path: string,
	issues: DomainValidationIssue[],
): NotificationRegistrationAddress {
	if (!isRecord(input)) {
		issues.push({ path, message: `${path} must be an address reference.` });
		return { kind: 'none' };
	}
	if (input.kind === 'none') {
		return { kind: 'none' };
	}
	if (input.kind === 'existing') {
		requireUuid(input.addressId, `${path}.addressId`, issues);
		return { kind: 'existing', addressId: normalizeRequiredId(input.addressId) };
	}
	if (input.kind === 'new') {
		requireUuid(input.addressId, `${path}.addressId`, issues);
		const details = normalizeInlineAddressDetails(input.details, `${path}.details`, issues);
		return { kind: 'new', addressId: normalizeRequiredId(input.addressId), details };
	}
	issues.push({ path: `${path}.kind`, message: `${path}.kind is not supported.` });
	return { kind: 'none' };
}

export function normalizeCreateContactDetails(
	input: CreateContactDetailsInput,
	path: string,
	issues: DomainValidationIssue[],
): CreateContactDetails {
	if (!isRecord(input)) {
		issues.push({ path, message: `${path} must be a contact details object.` });
		return emptyContactDetails();
	}
	const contactInput = input as CreateContactDetailsInput;
	const contactName = normalizeNullableText(
		contactInput.contactName,
		`${path}.contactName`,
		issues,
		200,
	);
	const preferredPhone = normalizeNullableText(
		contactInput.preferredPhone,
		`${path}.preferredPhone`,
		issues,
		100,
	);
	const alternatePhone = normalizeNullableText(
		contactInput.alternatePhone,
		`${path}.alternatePhone`,
		issues,
		100,
	);
	const email = normalizeEmail(contactInput.email, `${path}.email`, issues);
	const company = normalizeNullableText(contactInput.company, `${path}.company`, issues, 200);
	const department = normalizeNullableText(
		contactInput.department,
		`${path}.department`,
		issues,
		200,
	);
	const title = normalizeNullableText(contactInput.title, `${path}.title`, issues, 200);
	const wantsEmail = normalizeBooleanDefault(
		contactInput.wantsEmail,
		`${path}.wantsEmail`,
		issues,
		false,
	);
	const wantsSms = normalizeBooleanDefault(
		contactInput.wantsSms,
		`${path}.wantsSms`,
		issues,
		false,
	);
	const wantsPhone = normalizeBooleanDefault(
		contactInput.wantsPhone,
		`${path}.wantsPhone`,
		issues,
		false,
	);
	if (
		contactName === null &&
		preferredPhone === null &&
		alternatePhone === null &&
		email === null &&
		company === null
	) {
		issues.push({
			path,
			message: `${path} requires contactName, company, preferredPhone, alternatePhone, or email.`,
		});
	}
	if (alternatePhone !== null && preferredPhone === null) {
		issues.push({
			path: `${path}.alternatePhone`,
			message: 'alternatePhone cannot be set without preferredPhone.',
		});
	}
	if (wantsEmail && email === null) {
		issues.push({ path: `${path}.wantsEmail`, message: 'wantsEmail requires email.' });
	}
	if (wantsSms && preferredPhone === null) {
		issues.push({ path: `${path}.wantsSms`, message: 'wantsSms requires preferredPhone.' });
	}
	if (wantsPhone && preferredPhone === null) {
		issues.push({ path: `${path}.wantsPhone`, message: 'wantsPhone requires preferredPhone.' });
	}
	return {
		contactName,
		preferredPhone,
		alternatePhone,
		email,
		company,
		department,
		title,
		wantsEmail,
		wantsSms,
		wantsPhone,
	};
}

function emptyContactDetails(): CreateContactDetails {
	return {
		contactName: null,
		preferredPhone: null,
		alternatePhone: null,
		email: null,
		company: null,
		department: null,
		title: null,
		wantsEmail: false,
		wantsSms: false,
		wantsPhone: false,
	};
}

function normalizeInlineAddressDetails(
	input: CreateInlineAddressDetailsInput,
	path: string,
	issues: DomainValidationIssue[],
): CreateInlineAddressDetails {
	if (!isRecord(input)) {
		issues.push({ path, message: `${path} must be an address details object.` });
		return {
			displayName: '',
			geometry: { type: 'Point', coordinates: [0, 0] },
			country: 'US',
			addressLine1: null,
			addressLine2: null,
			locality: null,
			region: null,
			postalCode: null,
			geocoderResponse: null,
		};
	}
	return {
		displayName: normalizeRequiredText(input.displayName, `${path}.displayName`, issues, 200),
		geometry: validatePointGeometry(input.geometry, `${path}.geometry`, issues),
		country: normalizeCountry(input.country, `${path}.country`, issues),
		addressLine1: normalizeNullableText(input.addressLine1, `${path}.addressLine1`, issues, 200),
		addressLine2: normalizeNullableText(input.addressLine2, `${path}.addressLine2`, issues, 200),
		locality: normalizeNullableText(input.locality, `${path}.locality`, issues, 200),
		region: normalizeUsRegion(input.region, `${path}.region`, issues),
		postalCode: normalizePostalCode(input.postalCode, `${path}.postalCode`, issues),
		geocoderResponse: normalizeJsonObject(
			input.geocoderResponse,
			`${path}.geocoderResponse`,
			issues,
		),
	};
}

export function validateSubscriptionList(
	values: readonly NotificationRegistrationSubscriptionInput[],
	path: string,
	issues: DomainValidationIssue[],
): readonly NotificationRegistrationSubscription[] {
	if (!Array.isArray(values)) {
		issues.push({ path, message: `${path} must be an array.` });
		return [];
	}
	const rowIds = new Set<string>();
	const typeIds = new Set<string>();
	return values.map((value, index) => {
		requireUuid(
			value.notificationRegistrationTypeId,
			`${path}.${index}.notificationRegistrationTypeId`,
			issues,
		);
		requireUuid(value.notificationTypeId, `${path}.${index}.notificationTypeId`, issues);
		const notificationRegistrationTypeId = normalizeRequiredId(
			value.notificationRegistrationTypeId,
		);
		const notificationTypeId = normalizeRequiredId(value.notificationTypeId);
		if (rowIds.has(notificationRegistrationTypeId)) {
			issues.push({
				path: `${path}.${index}.notificationRegistrationTypeId`,
				message: 'notificationRegistrationTypeId values must be unique.',
			});
		}
		if (typeIds.has(notificationTypeId)) {
			issues.push({
				path: `${path}.${index}.notificationTypeId`,
				message: 'notificationTypeId values must be unique.',
			});
		}
		rowIds.add(notificationRegistrationTypeId);
		typeIds.add(notificationTypeId);
		return { notificationRegistrationTypeId, notificationTypeId };
	});
}

export function normalizeBuffer(
	input: { readonly bufferDistance?: number | null; readonly bufferUnitId?: DomainId | null },
	issues: DomainValidationIssue[],
): { readonly bufferDistance: number | null; readonly bufferUnitId: DomainId | null } {
	const hasDistance = input.bufferDistance !== undefined && input.bufferDistance !== null;
	const hasUnit = normalizeOptionalId(input.bufferUnitId) !== null;
	if (hasDistance !== hasUnit) {
		issues.push({
			path: 'buffer',
			message: 'bufferDistance and bufferUnitId must be provided together or cleared together.',
		});
	}
	let bufferDistance: number | null = null;
	if (hasDistance) {
		if (
			typeof input.bufferDistance !== 'number' ||
			!Number.isFinite(input.bufferDistance) ||
			input.bufferDistance <= 0
		) {
			issues.push({ path: 'bufferDistance', message: 'bufferDistance must be a positive number.' });
		} else {
			bufferDistance = input.bufferDistance;
		}
	}
	const bufferUnitId = normalizeOptionalUuid(input.bufferUnitId, 'bufferUnitId', issues);
	return { bufferDistance, bufferUnitId };
}

export function validateRegistrationPurpose(
	hasSubscriptions: boolean,
	hasBees: boolean,
	isNoSpray: boolean,
	path: string,
	issues: DomainValidationIssue[],
): void {
	if (!hasSubscriptions && !hasBees && !isNoSpray) {
		issues.push({
			path,
			message: 'Notification registration requires a subscription, hasBees, or isNoSpray.',
		});
	}
}

export function validatePhonePreferencePatch(
	value: boolean | undefined,
	hasValue: boolean,
	preferredPhone: string | null | undefined,
	hasPreferredPhone: boolean,
	path: string,
	issues: DomainValidationIssue[],
): void {
	if (!hasValue) {
		return;
	}
	validateBoolean(value, path, issues);
	if (value === true && hasPreferredPhone && preferredPhone === null) {
		issues.push({ path, message: `${path} requires preferredPhone.` });
	}
}

/** A Service Request's geometry, against the Service Request policy. */
function validatePointGeometry(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): GeoJsonPoint {
	try {
		return normalizeOwnedGeometry('serviceRequest', value, path) as GeoJsonPoint;
	} catch (error) {
		if (error instanceof DomainValidationError) {
			issues.push(...error.issues);
			return { type: 'Point', coordinates: [0, 0] };
		}
		throw error;
	}
}

function validateRegistrationGeometry(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): NotificationRegistrationGeometry {
	try {
		return normalizeOwnedGeometry('notificationRegistration', value, path);
	} catch (error) {
		if (error instanceof DomainValidationError) {
			issues.push(...error.issues);
			return { type: 'Point', coordinates: [0, 0] };
		}
		throw error;
	}
}

export function validateIdList(
	values: readonly DomainId[],
	path: string,
	issues: DomainValidationIssue[],
): readonly DomainId[] {
	if (!Array.isArray(values) || values.length === 0) {
		issues.push({ path, message: `${path} must include at least one id.` });
		return [];
	}
	const seen = new Set<string>();
	return values.map((value, index) => {
		requireUuid(value, `${path}.${index}`, issues);
		const normalized = normalizeRequiredId(value);
		if (seen.has(normalized)) {
			issues.push({ path: `${path}.${index}`, message: `${path} must not contain duplicates.` });
		}
		seen.add(normalized);
		return normalized;
	});
}

export function normalizeOptionalTimestamp(
	value: Date | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): Date | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
		issues.push({ path, message: `${path} must be a valid Date.` });
		return null;
	}
	if (value.getTime() > Date.now()) {
		issues.push({ path, message: `${path} cannot be in the future.` });
	}
	return value;
}

function normalizeCountry(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): 'US' {
	const normalized = value === undefined || value === null ? 'US' : value.trim().toUpperCase();
	if (normalized !== 'US') {
		issues.push({ path, message: `${path} must be US for v1.` });
	}
	return 'US';
}

function normalizeUsRegion(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): string | null {
	const normalized = normalizeNullableText(value, path, issues, 2);
	if (normalized === null) {
		return null;
	}
	const upper = normalized.toUpperCase();
	if (!/^[A-Z]{2}$/.test(upper)) {
		issues.push({ path, message: `${path} must be a two-letter state or territory code.` });
	}
	return upper;
}

function normalizePostalCode(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): string | null {
	const normalized = normalizeNullableText(value, path, issues, 10);
	if (normalized === null) {
		return null;
	}
	if (!/^\d{5}(-\d{4})?$/.test(normalized)) {
		issues.push({ path, message: `${path} must be a ZIP or ZIP+4 postal code.` });
	}
	return normalized;
}

export function normalizeEmail(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): string | null {
	const normalized = normalizeNullableText(value, path, issues, 320);
	if (normalized === null) {
		return null;
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
		issues.push({ path, message: `${path} must be a valid email address.` });
	}
	return normalized.toLowerCase();
}

export function normalizeStringUnion<TValue extends string>(
	value: string | undefined,
	allowedValues: readonly TValue[],
	path: string,
	issues: DomainValidationIssue[],
): TValue {
	if (value === undefined || !allowedValues.includes(value as TValue)) {
		issues.push({ path, message: `${path} is not supported.` });
		return (allowedValues[0] ?? '') as TValue;
	}
	return value as TValue;
}

export function normalizeBooleanDefault(
	value: boolean | undefined,
	path: string,
	issues: DomainValidationIssue[],
	defaultValue: boolean,
): boolean {
	if (value === undefined) {
		return defaultValue;
	}
	validateBoolean(value, path, issues);
	return value === true;
}

export function validateBoolean(
	value: boolean | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	if (typeof value !== 'boolean') {
		issues.push({ path, message: `${path} must be a boolean.` });
	}
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
