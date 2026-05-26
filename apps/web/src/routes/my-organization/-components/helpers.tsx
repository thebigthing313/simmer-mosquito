import type {
	AdultCollectionTimingMode,
	LarvalDensityRange,
	LarvalDensityRanges,
	OrganizationSettings,
	ResolvedLarvalInspectionEntryPolicy,
	UnitDefaults,
} from '@simmer-mosquito/domain';
import type {
	CollectionLureRow,
	CollectionMethodRow,
	ControlMethodRow,
	EquipmentRow,
	HabitatTypeRow,
	InsecticideBatchRow,
	InsecticideRow,
	NotificationTypeRow,
	OrganizationRow,
	ProfileRow,
	TagRow,
	UnitRow,
} from '@simmer-mosquito/sync';
import type { Collection } from '@tanstack/react-db';
import { toast } from 'sonner';
import type { AuthMe } from '../../../auth';
import { collections, defaultDensityRangeValues } from './constants';
import type {
	AdultCollectionLureFormValues,
	AdultCollectionMethodFormValues,
	AgencyDetailsFormValues,
	ControlAssetCollectionKey,
	ControlAssetFormValues,
	ControlAssetRow,
	ControlMethodCollectionKey,
	ControlMethodFormValues,
	ControlSettingsFormValues,
	DensityRangeFormValue,
	DensityRangeFormValues,
	DensityRangeKey,
	HabitatTypeFormValues,
	InsecticideBatchFormValues,
	InsecticideFormValues,
	LarvalDensityDisplayKey,
	MutableCollectionLureRow,
	MutableCollectionMethodRow,
	MutableControlMethodRow,
	MutableEquipmentRow,
	MutableHabitatTypeRow,
	MutableInsecticideBatchRow,
	MutableInsecticideRow,
	MutableNotificationTypeRow,
	MutableOrganizationRow,
	MutableProfileRow,
	MutableTagRow,
	MutableVehicleRow,
	NotificationTypeFormValues,
	OrganizationFallback,
	OrgRole,
	PersistenceTransaction,
	ProfileFormValues,
	ProfileGroups,
	PublicSettingsFormValues,
	SelectOption,
	SelectSettingField,
	SettingField,
	TagFormValues,
	TextSettingField,
	UnitDefaultsFormValues,
} from './types';

export function formatRole(role: OrgRole): string {
	return role.charAt(0).toUpperCase() + role.slice(1);
}

export function profileGroups(profiles: readonly ProfileRow[]): ProfileGroups {
	const sorted = [...profiles].sort(
		(first, second) =>
			Number(second.isActive) - Number(first.isActive) ||
			first.displayName.localeCompare(second.displayName),
	);

	return {
		activeLinked: sorted.filter((profile) => profile.isActive && profile.userId !== null),
		inactiveLinked: sorted.filter((profile) => !profile.isActive && profile.userId !== null),
		historical: sorted.filter((profile) => profile.userId === null),
	};
}

export function sortedTags(tags: readonly TagRow[]): TagRow[] {
	return [...tags].sort((first, second) => first.tagName.localeCompare(second.tagName));
}

export function validHexColor(value: string | null): string | null {
	if (value === null) {
		return null;
	}

	const normalized = value.trim();
	return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : null;
}

export function hexWithAlpha(hex: string, alpha: number): string {
	const alphaHex = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
		.toString(16)
		.padStart(2, '0');
	return `${hex}${alphaHex}`;
}

export function errorMessageForSave(saveError: unknown): string {
	return saveError instanceof Error ? saveError.message : 'Unable to save changes.';
}

export function AgencyDetailLine({
	label,
	value,
}: {
	readonly label: string;
	readonly value: string | null | undefined;
}) {
	return (
		<p className="m-0 grid grid-cols-[76px_minmax(0,1fr)] items-baseline gap-2.5">
			<span className="text-[0.8rem] font-bold text-muted-foreground">{label}</span>
			<strong className="wrap-anywhere text-[0.92rem] leading-normal text-foreground">
				{value === undefined || value === null || value.length === 0 ? 'Not set' : value}
			</strong>
		</p>
	);
}

export function formatMailingAddress(organization: OrganizationRow | null): string {
	const parts = [
		organization?.mailingAddressLine1,
		organization?.mailingAddressLine2,
		organization?.mailingLocality,
		organization?.mailingRegion,
		organization?.mailingPostalCode,
		organization?.mailingCountry,
	].filter((part): part is string => typeof part === 'string' && part.length > 0);

	return parts.length === 0 ? 'Not set' : parts.join(', ');
}

export function agencyDetailsFormValues(
	organization: OrganizationRow | null,
	organizationFallback: OrganizationFallback,
	settings: OrganizationSettings,
): AgencyDetailsFormValues {
	return {
		name: organization?.name ?? organizationFallback.name ?? '',
		mainContactEmail: organization?.mainContactEmail ?? '',
		phoneNumber: organization?.phoneNumber ?? '',
		mailingAddressLine1: organization?.mailingAddressLine1 ?? '',
		mailingAddressLine2: organization?.mailingAddressLine2 ?? '',
		mailingLocality: organization?.mailingLocality ?? '',
		mailingRegion: organization?.mailingRegion ?? '',
		mailingPostalCode: organization?.mailingPostalCode ?? '',
		timezone: settings.timezone,
	};
}

export function saveAgencyDetailsFromValues(
	organization: OrganizationRow | null,
	settings: OrganizationSettings,
	values: AgencyDetailsFormValues,
): PersistenceTransaction {
	return updateCurrentOrganizationOptimistically(organization, (draft) => {
		draft.name = requiredTextValue(values.name, 'Organization name');
		draft.mainContactEmail = nullableTextValue(values.mainContactEmail);
		draft.phoneNumber = nullableTextValue(values.phoneNumber);
		draft.mailingCountry = 'US';
		draft.mailingAddressLine1 = nullableTextValue(values.mailingAddressLine1);
		draft.mailingAddressLine2 = nullableTextValue(values.mailingAddressLine2);
		draft.mailingLocality = nullableTextValue(values.mailingLocality);
		draft.mailingRegion = nullableTextValue(values.mailingRegion);
		draft.mailingPostalCode = nullableTextValue(values.mailingPostalCode);
		draft.settings = {
			...settings,
			timezone: requiredTextValue(values.timezone, 'Timezone'),
		};
	});
}

export function unitDefaultsFormValues(unitDefaults: UnitDefaults): UnitDefaultsFormValues {
	return { ...unitDefaults };
}

export function saveUnitDefaultsFromValues(
	organization: OrganizationRow | null,
	settings: OrganizationSettings,
	values: UnitDefaultsFormValues,
): PersistenceTransaction {
	return updateCurrentOrganizationOptimistically(organization, (draft) => {
		draft.settings = {
			...settings,
			unitDefaults: Object.fromEntries(
				Object.entries(values).map(([unitType, unitCode]) => [
					unitType,
					requiredTextValue(unitCode, formatMode(unitType)),
				]),
			) as UnitDefaults,
		};
	});
}

export function saveAdultSettings(
	organization: OrganizationRow | null,
	settings: OrganizationSettings,
	formData: FormData,
): Promise<void> {
	return updateCurrentOrganization(organization, (draft) => {
		draft.settings = {
			...settings,
			adultSurveillance: {
				...settings.adultSurveillance,
				collectionTimingMode: requiredFormText(
					formData,
					'Collection timing',
				) as AdultCollectionTimingMode,
			},
		};
	});
}

export function saveLarvalSettingsFromValues(
	organization: OrganizationRow | null,
	settings: OrganizationSettings,
	policy: ResolvedLarvalInspectionEntryPolicy,
): PersistenceTransaction {
	return updateCurrentOrganizationOptimistically(organization, (draft) => {
		draft.settings = {
			...settings,
			larvalSurveillance: {
				...settings.larvalSurveillance,
				inspectionEntryPolicy: policy,
			},
		};
	});
}

export function saveControlSettingsFromValues(
	organization: OrganizationRow | null,
	settings: OrganizationSettings,
	values: ControlSettingsFormValues,
): PersistenceTransaction {
	return updateCurrentOrganizationOptimistically(organization, (draft) => {
		draft.settings = {
			...settings,
			controlOperations: {
				...settings.controlOperations,
				trackInsecticideBatches: values.trackInsecticideBatches,
			},
		};
	});
}

export function savePublicSettingsFromValues(
	organization: OrganizationRow | null,
	settings: OrganizationSettings,
	values: PublicSettingsFormValues,
): PersistenceTransaction {
	return updateCurrentOrganizationOptimistically(organization, (draft) => {
		draft.settings = {
			...settings,
			publicEngagement: {
				...settings.publicEngagement,
				serviceRequestContext: {
					...settings.publicEngagement.serviceRequestContext,
					radius: {
						amount: nonnegativeNumberValue(values.radiusAmount, 'Related-record radius'),
						unitCode: requiredTextValue(values.radiusUnitCode, 'Radius unit'),
					},
					timeWindow: {
						daysBefore: nonnegativeIntegerValue(values.daysBefore, 'Days before'),
						daysAfter: nonnegativeIntegerValue(values.daysAfter, 'Days after'),
					},
				},
			},
		};
	});
}

export function createOrganizationTag(
	organization: OrganizationRow | null,
	formData: FormData,
): PersistenceTransaction {
	if (organization === null) {
		throw new Error('Organization details are still loading.');
	}

	const now = new Date().toISOString();
	return collections.tags.insert({
		id: crypto.randomUUID(),
		organizationId: organization.id,
		tagName: requiredFormText(formData, 'tagName'),
		description: nullableFormText(formData, 'description'),
		color: nullableFormHexColor(formData, 'color'),
		isActive: true,
		createdAt: now,
		updatedAt: now,
	});
}

export function createOrganizationTagFromValues(
	organization: OrganizationRow | null,
	values: TagFormValues,
): PersistenceTransaction {
	return createOrganizationTag(organization, tagFormData(values));
}

export function createHistoricalProfile(
	organization: OrganizationRow | null,
	values: ProfileFormValues,
): PersistenceTransaction {
	if (organization === null) {
		throw new Error('Organization details are still loading.');
	}

	const now = new Date().toISOString();
	return collections.profiles.insert({
		id: crypto.randomUUID(),
		organizationId: organization.id,
		userId: null,
		displayName: requiredTextValue(values.displayName, 'Display name'),
		email: null,
		isActive: values.isActive,
		createdAt: now,
		updatedAt: now,
	});
}

export function updateProfile(
	profile: ProfileRow,
	values: ProfileFormValues,
): PersistenceTransaction {
	return collections.profiles.update(profile.id, (draft) => {
		const mutable = draft as MutableProfileRow;
		mutable.displayName = requiredTextValue(values.displayName, 'Display name');
		mutable.isActive = values.isActive;
		mutable.updatedAt = new Date().toISOString();
	});
}

export function updateOrganizationTag(
	tag: TagRow,
	formData: FormData,
	isActive: boolean,
): PersistenceTransaction {
	return collections.tags.update(tag.id, (draft) => {
		const mutable = draft as MutableTagRow;
		mutable.tagName = requiredFormText(formData, 'tagName');
		mutable.description = nullableFormText(formData, 'description');
		mutable.color = nullableFormHexColor(formData, 'color');
		mutable.isActive = isActive;
		mutable.updatedAt = new Date().toISOString();
	});
}

export function updateOrganizationTagFromValues(
	tag: TagRow,
	values: TagFormValues,
): PersistenceTransaction {
	return updateOrganizationTag(tag, tagFormData(values), values.isActive);
}

export function deleteOrganizationTag(tag: TagRow): PersistenceTransaction {
	return collections.tags.delete(tag.id);
}

export function tagFormData(values: TagFormValues): FormData {
	const formData = new FormData();
	formData.set('tagName', values.tagName);
	formData.set('description', values.description);
	formData.set('color', values.color);
	return formData;
}

export function updateCurrentOrganization(
	organization: OrganizationRow | null,
	applyChanges: (draft: MutableOrganizationRow) => void,
): Promise<void> {
	return updateCurrentOrganizationOptimistically(
		organization,
		applyChanges,
	).isPersisted.promise.then(() => undefined);
}

export function updateCurrentOrganizationOptimistically(
	organization: OrganizationRow | null,
	applyChanges: (draft: MutableOrganizationRow) => void,
): PersistenceTransaction {
	if (organization === null) {
		throw new Error('Organization details are still loading.');
	}

	return collections.currentOrganization.update(organization.id, (draft) => {
		applyChanges(draft as MutableOrganizationRow);
	});
}

export function watchPersistence(transaction: PersistenceTransaction, fallback: string): void {
	void transaction.isPersisted.promise.catch((error) => {
		const message = errorMessageForSave(error);
		toast.error(message === 'Unable to save changes.' ? fallback : message);
	});
}

export function requiredFormText(formData: FormData, name: string): string {
	const value = formData.get(name);
	const text = typeof value === 'string' ? value.trim() : '';
	if (text.length === 0) {
		throw new Error(`${name} is required.`);
	}
	return text;
}

export function nullableFormText(formData: FormData, name: string): string | null {
	const value = formData.get(name);
	const text = typeof value === 'string' ? value.trim() : '';
	return text.length === 0 ? null : text;
}

export function nullableFormHexColor(formData: FormData, name: string): string | null {
	const text = nullableFormText(formData, name);
	if (text === null) {
		return null;
	}

	const normalized = text.startsWith('#') ? text : `#${text}`;
	if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
		throw new Error(`${name} must be a hex color like #2563EB.`);
	}

	return normalized.toUpperCase();
}

export function requiredTextValue(value: string, label: string): string {
	const text = value.trim();
	if (text.length === 0) {
		throw new Error(`${label} is required.`);
	}
	return text;
}

export function nullableTextValue(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}

export function validateEmail({ value }: { readonly value: string }): string | undefined {
	const text = value.trim();
	if (text.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
		return undefined;
	}

	return 'Main contact must be a valid email address.';
}

export function createAdultCollectionMethodFromValues(
	organization: OrganizationRow | null,
	values: AdultCollectionMethodFormValues,
): PersistenceTransaction {
	if (organization === null) {
		throw new Error('Organization details are still loading.');
	}

	const now = new Date().toISOString();
	return collections.collectionMethods.insert({
		id: crypto.randomUUID(),
		organizationId: organization.id,
		name: requiredTextValue(values.name, 'Name'),
		description: nullableTextValue(values.description),
		customSchema: values.customSchema,
		actionThreshold: nullableNonnegativeIntegerValue(values.actionThreshold, 'Action threshold'),
		isActive: values.isActive,
		createdAt: now,
		updatedAt: now,
	});
}

export function createAdultCollectionLureFromValues(
	organization: OrganizationRow | null,
	values: AdultCollectionLureFormValues,
): PersistenceTransaction {
	if (organization === null) {
		throw new Error('Organization details are still loading.');
	}

	const now = new Date().toISOString();
	return collections.collectionLures.insert({
		id: crypto.randomUUID(),
		organizationId: organization.id,
		name: requiredTextValue(values.name, 'Name'),
		description: nullableTextValue(values.description),
		isActive: values.isActive,
		createdAt: now,
		updatedAt: now,
	});
}

export function createHabitatTypeFromValues(
	organization: OrganizationRow | null,
	values: HabitatTypeFormValues,
): PersistenceTransaction {
	if (organization === null) {
		throw new Error('Organization details are still loading.');
	}

	const now = new Date().toISOString();
	return collections.habitatTypes.insert({
		id: crypto.randomUUID(),
		organizationId: organization.id,
		name: requiredTextValue(values.name, 'Name'),
		description: nullableTextValue(values.description),
		customSchema: values.customSchema,
		isActive: values.isActive,
		createdAt: now,
		updatedAt: now,
	});
}

export function createControlMethodFromValues(
	collectionKey: ControlMethodCollectionKey,
	organization: OrganizationRow | null,
	values: ControlMethodFormValues,
): PersistenceTransaction {
	if (organization === null) {
		throw new Error('Organization details are still loading.');
	}

	const now = new Date().toISOString();
	const row: ControlMethodRow = {
		id: crypto.randomUUID(),
		organizationId: organization.id,
		name: requiredTextValue(values.name, 'Name'),
		customSchema: values.customSchema,
		isActive: values.isActive,
		createdAt: now,
		updatedAt: now,
	};

	switch (collectionKey) {
		case 'applicationMethods':
			return collections.applicationMethods.insert(row);
		case 'sourceReductionMethods':
			return collections.sourceReductionMethods.insert(row);
		case 'outreachMethods':
			return collections.outreachMethods.insert(row);
		case 'biocontrolMethods':
			return collections.biocontrolMethods.insert(row);
	}
}

export function createNotificationTypeFromValues(
	organization: OrganizationRow | null,
	values: NotificationTypeFormValues,
): PersistenceTransaction {
	if (organization === null) {
		throw new Error('Organization details are still loading.');
	}

	const now = new Date().toISOString();
	return collections.notificationTypes.insert({
		id: crypto.randomUUID(),
		organizationId: organization.id,
		name: requiredTextValue(values.name, 'Name'),
		description: nullableTextValue(values.description),
		isActive: values.isActive,
		createdAt: now,
		updatedAt: now,
	});
}

export function createControlAssetFromValues(
	collectionKey: ControlAssetCollectionKey,
	organization: OrganizationRow | null,
	values: ControlAssetFormValues,
): PersistenceTransaction {
	if (organization === null) {
		throw new Error('Organization details are still loading.');
	}

	const now = new Date().toISOString();
	if (collectionKey === 'vehicles') {
		return collections.vehicles.insert({
			id: crypto.randomUUID(),
			organizationId: organization.id,
			vehicleName: requiredTextValue(values.name, 'Name'),
			metadata: values.metadata,
			isActive: values.isActive,
			createdAt: now,
			updatedAt: now,
		});
	}

	return collections.equipment.insert({
		id: crypto.randomUUID(),
		organizationId: organization.id,
		equipmentName: requiredTextValue(values.name, 'Name'),
		serialNumber: nullableTextValue(values.serialNumber),
		metadata: values.metadata,
		isActive: values.isActive,
		createdAt: now,
		updatedAt: now,
	});
}

export function createInsecticideFromValues(
	organization: OrganizationRow | null,
	values: InsecticideFormValues,
): PersistenceTransaction {
	if (organization === null) {
		throw new Error('Organization details are still loading.');
	}

	const now = new Date().toISOString();
	return collections.insecticides.insert({
		id: crypto.randomUUID(),
		organizationId: organization.id,
		tradeName: requiredTextValue(values.tradeName, 'Trade name'),
		activeIngredient: requiredTextValue(values.activeIngredient, 'Active ingredient'),
		type: values.type,
		registrationNumber: requiredTextValue(values.registrationNumber, 'Registration number'),
		defaultUnitId: requiredTextValue(values.defaultUnitId, 'Default usage unit'),
		labelUrl: nullableTextValue(values.labelUrl),
		msdsUrl: nullableTextValue(values.msdsUrl),
		shorthand: nullableTextValue(values.shorthand),
		metadata: values.metadata,
		isActive: values.isActive,
		createdAt: now,
		updatedAt: now,
	});
}

export function createInsecticideBatchFromValues(
	collection: Collection<InsecticideBatchRow, string | number>,
	organization: OrganizationRow | null,
	values: InsecticideBatchFormValues,
): PersistenceTransaction {
	if (organization === null) {
		throw new Error('Organization details are still loading.');
	}

	const now = new Date().toISOString();
	return collection.insert({
		id: crypto.randomUUID(),
		organizationId: organization.id,
		insecticideId: requiredTextValue(values.insecticideId, 'Insecticide'),
		batchName: requiredTextValue(values.batchName, 'Batch name'),
		isActive: values.isActive,
		createdAt: now,
		updatedAt: now,
	});
}

export function updateAdultCollectionMethodFromValues(
	method: CollectionMethodRow,
	values: AdultCollectionMethodFormValues,
): PersistenceTransaction {
	return collections.collectionMethods.update(method.id, (draft) => {
		const mutable = draft as MutableCollectionMethodRow;
		mutable.name = requiredTextValue(values.name, 'Name');
		mutable.description = nullableTextValue(values.description);
		mutable.customSchema = values.customSchema;
		mutable.actionThreshold = nullableNonnegativeIntegerValue(
			values.actionThreshold,
			'Action threshold',
		);
		mutable.isActive = values.isActive;
		mutable.updatedAt = new Date().toISOString();
	});
}

export function updateAdultCollectionLureFromValues(
	lure: CollectionLureRow,
	values: AdultCollectionLureFormValues,
): PersistenceTransaction {
	return collections.collectionLures.update(lure.id, (draft) => {
		const mutable = draft as MutableCollectionLureRow;
		mutable.name = requiredTextValue(values.name, 'Name');
		mutable.description = nullableTextValue(values.description);
		mutable.isActive = values.isActive;
		mutable.updatedAt = new Date().toISOString();
	});
}

export function updateHabitatTypeFromValues(
	habitatType: HabitatTypeRow,
	values: HabitatTypeFormValues,
): PersistenceTransaction {
	return collections.habitatTypes.update(habitatType.id, (draft) => {
		const mutable = draft as MutableHabitatTypeRow;
		mutable.name = requiredTextValue(values.name, 'Name');
		mutable.description = nullableTextValue(values.description);
		mutable.customSchema = values.customSchema;
		mutable.isActive = values.isActive;
		mutable.updatedAt = new Date().toISOString();
	});
}

export function updateControlMethodFromValues(
	collectionKey: ControlMethodCollectionKey,
	method: ControlMethodRow,
	values: ControlMethodFormValues,
): PersistenceTransaction {
	const update = (draft: ControlMethodRow) => {
		const mutable = draft as MutableControlMethodRow;
		mutable.name = requiredTextValue(values.name, 'Name');
		mutable.customSchema = values.customSchema;
		mutable.isActive = values.isActive;
		mutable.updatedAt = new Date().toISOString();
	};

	switch (collectionKey) {
		case 'applicationMethods':
			return collections.applicationMethods.update(method.id, update);
		case 'sourceReductionMethods':
			return collections.sourceReductionMethods.update(method.id, update);
		case 'outreachMethods':
			return collections.outreachMethods.update(method.id, update);
		case 'biocontrolMethods':
			return collections.biocontrolMethods.update(method.id, update);
	}
}

export function updateNotificationTypeFromValues(
	notificationType: NotificationTypeRow,
	values: NotificationTypeFormValues,
): PersistenceTransaction {
	return collections.notificationTypes.update(notificationType.id, (draft) => {
		const mutable = draft as MutableNotificationTypeRow;
		mutable.name = requiredTextValue(values.name, 'Name');
		mutable.description = nullableTextValue(values.description);
		mutable.isActive = values.isActive;
		mutable.updatedAt = new Date().toISOString();
	});
}

export function updateControlAssetFromValues(
	collectionKey: ControlAssetCollectionKey,
	asset: ControlAssetRow,
	values: ControlAssetFormValues,
): PersistenceTransaction {
	if (collectionKey === 'vehicles') {
		return collections.vehicles.update(asset.id, (draft) => {
			const mutable = draft as MutableVehicleRow;
			mutable.vehicleName = requiredTextValue(values.name, 'Name');
			mutable.metadata = values.metadata;
			mutable.isActive = values.isActive;
			mutable.updatedAt = new Date().toISOString();
		});
	}

	return collections.equipment.update(asset.id, (draft) => {
		const mutable = draft as MutableEquipmentRow;
		mutable.equipmentName = requiredTextValue(values.name, 'Name');
		mutable.serialNumber = nullableTextValue(values.serialNumber);
		mutable.metadata = values.metadata;
		mutable.isActive = values.isActive;
		mutable.updatedAt = new Date().toISOString();
	});
}

export function updateInsecticideFromValues(
	insecticide: InsecticideRow,
	values: InsecticideFormValues,
): PersistenceTransaction {
	return collections.insecticides.update(insecticide.id, (draft) => {
		const mutable = draft as MutableInsecticideRow;
		mutable.tradeName = requiredTextValue(values.tradeName, 'Trade name');
		mutable.activeIngredient = requiredTextValue(values.activeIngredient, 'Active ingredient');
		mutable.type = values.type;
		mutable.registrationNumber = requiredTextValue(
			values.registrationNumber,
			'Registration number',
		);
		mutable.defaultUnitId = requiredTextValue(values.defaultUnitId, 'Default usage unit');
		mutable.labelUrl = nullableTextValue(values.labelUrl);
		mutable.msdsUrl = nullableTextValue(values.msdsUrl);
		mutable.shorthand = nullableTextValue(values.shorthand);
		mutable.metadata = values.metadata;
		mutable.isActive = values.isActive;
		mutable.updatedAt = new Date().toISOString();
	});
}

export function updateInsecticideBatchFromValues(
	collection: Collection<InsecticideBatchRow, string | number>,
	batch: InsecticideBatchRow,
	values: InsecticideBatchFormValues,
): PersistenceTransaction {
	return collection.update(batch.id, (draft) => {
		const mutable = draft as MutableInsecticideBatchRow;
		mutable.insecticideId = requiredTextValue(values.insecticideId, 'Insecticide');
		mutable.batchName = requiredTextValue(values.batchName, 'Batch name');
		mutable.isActive = values.isActive;
		mutable.updatedAt = new Date().toISOString();
	});
}

export function nullableNonnegativeIntegerValue(
	value: number | null,
	label: string,
): number | null {
	if (value === null) {
		return null;
	}

	if (!Number.isInteger(value) || value < 0) {
		throw new Error(`${label} must be a nonnegative whole number.`);
	}
	return value;
}

export function nonnegativeNumberValue(value: number | null, label: string): number {
	if (value === null || !Number.isFinite(value) || value < 0) {
		throw new Error(`${label} must be zero or greater.`);
	}
	return value;
}

export function nonnegativeIntegerValue(value: number | null, label: string): number {
	if (value === null || !Number.isInteger(value) || value < 0) {
		throw new Error(`${label} must be a nonnegative whole number.`);
	}
	return value;
}

export function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function collectionMethodFormValues(
	method: CollectionMethodRow | undefined,
): AdultCollectionMethodFormValues {
	const customSchema = method?.customSchema;
	return {
		name: method?.name ?? '',
		description: method?.description ?? '',
		actionThreshold: method?.actionThreshold ?? null,
		customSchema: isPlainJsonObject(customSchema) ? customSchema : null,
		isActive: method?.isActive ?? true,
	};
}

export function collectionLureFormValues(
	lure: CollectionLureRow | undefined,
): AdultCollectionLureFormValues {
	return {
		name: lure?.name ?? '',
		description: lure?.description ?? '',
		isActive: lure?.isActive ?? true,
	};
}

export function habitatTypeFormValues(
	habitatType: HabitatTypeRow | undefined,
): HabitatTypeFormValues {
	const customSchema = habitatType?.customSchema;
	return {
		name: habitatType?.name ?? '',
		description: habitatType?.description ?? '',
		customSchema: isPlainJsonObject(customSchema) ? customSchema : null,
		isActive: habitatType?.isActive ?? true,
	};
}

export function controlMethodFormValues(
	method: ControlMethodRow | undefined,
): ControlMethodFormValues {
	const customSchema = method?.customSchema;
	return {
		name: method?.name ?? '',
		customSchema: isPlainJsonObject(customSchema) ? customSchema : null,
		isActive: method?.isActive ?? true,
	};
}

export function controlAssetFormValues(asset: ControlAssetRow | undefined): ControlAssetFormValues {
	const metadata = asset?.metadata;
	return {
		name: asset === undefined ? '' : controlAssetName(asset),
		serialNumber: isEquipmentRow(asset) ? (asset.serialNumber ?? '') : '',
		metadata: isPlainJsonObject(metadata) ? metadata : null,
		isActive: asset?.isActive ?? true,
	};
}

export function insecticideFormValues(
	insecticide: InsecticideRow | undefined,
	defaultUnitId: string,
): InsecticideFormValues {
	const metadata = insecticide?.metadata;
	return {
		tradeName: insecticide?.tradeName ?? '',
		activeIngredient: insecticide?.activeIngredient ?? '',
		type: insecticide?.type ?? 'adulticide',
		registrationNumber: insecticide?.registrationNumber ?? '',
		defaultUnitId: insecticide?.defaultUnitId ?? defaultUnitId,
		labelUrl: insecticide?.labelUrl ?? '',
		msdsUrl: insecticide?.msdsUrl ?? '',
		shorthand: insecticide?.shorthand ?? '',
		metadata: isPlainJsonObject(metadata) ? metadata : null,
		isActive: insecticide?.isActive ?? true,
	};
}

export function insecticideBatchFormValues(
	batch: InsecticideBatchRow | undefined,
	defaultInsecticideId: string,
): InsecticideBatchFormValues {
	return {
		insecticideId: batch?.insecticideId ?? defaultInsecticideId,
		batchName: batch?.batchName ?? '',
		isActive: batch?.isActive ?? true,
	};
}

export function notificationTypeFormValues(
	notificationType: NotificationTypeRow | undefined,
): NotificationTypeFormValues {
	return {
		name: notificationType?.name ?? '',
		description: notificationType?.description ?? '',
		isActive: notificationType?.isActive ?? true,
	};
}

export function publicSettingsFormValues(settings: OrganizationSettings): PublicSettingsFormValues {
	const context = settings.publicEngagement.serviceRequestContext;
	return {
		radiusAmount: context.radius.amount,
		radiusUnitCode: context.radius.unitCode,
		daysBefore: context.timeWindow.daysBefore,
		daysAfter: context.timeWindow.daysAfter,
	};
}

export function densityRangeFormValues(ranges: LarvalDensityRanges | null): DensityRangeFormValues {
	if (ranges === null) {
		return defaultDensityRangeValues;
	}

	return {
		light: densityRangeFormValue(ranges.light),
		medium: densityRangeFormValue(ranges.medium),
		heavy: densityRangeFormValue(ranges.heavy),
		very_heavy: densityRangeFormValue(ranges.veryHeavy),
	};
}

export function densityRangeFormValue(range: LarvalDensityRange): DensityRangeFormValue {
	return {
		minInclusive: String(range.minInclusive),
		maxExclusive:
			range.maxExclusive === null || range.maxExclusive === undefined
				? ''
				: String(range.maxExclusive),
	};
}

export function densityRangesFromFormValues(values: DensityRangeFormValues): LarvalDensityRanges {
	const ranges = {
		light: densityRangeFromFormValue(values.light, 'light'),
		medium: densityRangeFromFormValue(values.medium, 'medium'),
		heavy: densityRangeFromFormValue(values.heavy, 'heavy'),
		veryHeavy: {
			minInclusive: requiredFiniteNumber(values.very_heavy.minInclusive, 'Very heavy minimum'),
		},
	};
	validateDensityRangesForUi(ranges);
	return ranges;
}

export function safeDensityRangesFromFormValues(
	values: DensityRangeFormValues,
): LarvalDensityRanges | null {
	try {
		return densityRangesFromFormValues(values);
	} catch {
		return null;
	}
}

export function densityRangeFromFormValue(
	value: DensityRangeFormValue,
	label: string,
): LarvalDensityRange {
	const minInclusive =
		label === 'light'
			? 0
			: requiredFiniteNumber(value.minInclusive, `${densityLabel(label)} lower bound`);
	return {
		minInclusive,
		maxExclusive: requiredFiniteNumber(value.maxExclusive, `${densityLabel(label)} upper bound`),
	};
}

export function validateDensityRangesForUi(ranges: LarvalDensityRanges): void {
	const sequence: Array<readonly [DensityRangeKey, LarvalDensityRange]> = [
		['light', ranges.light],
		['medium', ranges.medium],
		['heavy', ranges.heavy],
		['very_heavy', ranges.veryHeavy],
	];
	let previousMax: number | null = null;
	for (const [density, range] of sequence) {
		if (previousMax === null && range.minInclusive !== 0) {
			throw new Error('Light lower bound must be 0 larvae per dip.');
		}
		if (previousMax !== null && range.minInclusive !== previousMax) {
			throw new Error(`${densityLabel(density)} lower bound must match the previous upper bound.`);
		}
		if (
			range.maxExclusive !== null &&
			range.maxExclusive !== undefined &&
			range.maxExclusive <= range.minInclusive
		) {
			throw new Error(`${densityLabel(density)} upper bound must be greater than its lower bound.`);
		}
		previousMax = range.maxExclusive ?? null;
	}
}

export function requiredFiniteNumber(value: string, label: string): number {
	const numberValue = Number(value);
	if (!Number.isFinite(numberValue) || numberValue < 0) {
		throw new Error(`${label} must be a number greater than or equal to zero.`);
	}
	return numberValue;
}

export function densityKeyForSettings(density: DensityRangeKey): keyof LarvalDensityRanges {
	return density === 'very_heavy' ? 'veryHeavy' : density;
}

export function densityLabel(density: LarvalDensityDisplayKey | string): string {
	return density === 'very_heavy'
		? 'Very heavy'
		: density.charAt(0).toUpperCase() + density.slice(1);
}

export function formatDensityRange(range: LarvalDensityRange | null): string {
	if (range === null) {
		return 'Not set';
	}

	return range.maxExclusive === null || range.maxExclusive === undefined
		? `More than ${range.minInclusive} larvae per dip`
		: `More than ${range.minInclusive} and up to ${range.maxExclusive} larvae per dip`;
}

export function controlAssetName(asset: ControlAssetRow): string {
	return isEquipmentRow(asset) ? asset.equipmentName : asset.vehicleName;
}

export function isEquipmentRow(asset: ControlAssetRow | undefined): asset is EquipmentRow {
	return asset !== undefined && 'equipmentName' in asset;
}

export function hasMetadata(value: unknown): boolean {
	return isPlainJsonObject(value) && Object.keys(value).length > 0;
}

export function textField(
	label: string,
	value: string,
	options: {
		readonly editable?: boolean;
		readonly inputType?: React.HTMLInputTypeAttribute;
	} = {},
): TextSettingField {
	return {
		kind: 'text',
		label,
		value,
		editable: options.editable ?? true,
		inputType: options.inputType,
	};
}

export function selectField(
	label: string,
	value: string,
	options: readonly SelectOption[],
): SelectSettingField {
	return {
		kind: 'select',
		label,
		value,
		editable: true,
		options: selectOptionsForValue(value, options),
	};
}

export function unitDefaultFields(
	unitDefaults: UnitDefaults,
	units: readonly UnitRow[],
): readonly SelectSettingField[] {
	return (Object.entries(unitDefaults) as Array<[keyof UnitDefaults, string]>).map(
		([unitType, code]) =>
			selectField(
				formatMode(unitType),
				code,
				unitOptionsForDefault(
					code,
					units.filter((unit) => unit.unitType === unitType),
				),
			),
	);
}

export function unitOptionsForDefault(
	code: string,
	units: readonly UnitRow[],
): readonly SelectOption[] {
	return [...units]
		.sort((first, second) => compareUnitsForSelect(code, first, second))
		.map(unitOption);
}

export function compareUnitsForSelect(code: string, first: UnitRow, second: UnitRow): number {
	if (first.code === code || second.code === code) {
		return first.code === code ? -1 : 1;
	}

	return (
		first.unitSystem.localeCompare(second.unitSystem) ||
		first.unitName.localeCompare(second.unitName) ||
		first.code.localeCompare(second.code)
	);
}

export function unitOption(unit: UnitRow): SelectOption {
	return {
		label:
			unit.abbreviation.length === 0 ? unit.unitName : `${unit.unitName} (${unit.abbreviation})`,
		value: unit.code,
	};
}

export function selectOptionsForValue(
	value: string,
	options: readonly SelectOption[],
): readonly SelectOption[] {
	if (value.length === 0 || options.some((option) => option.value === value)) {
		return options;
	}

	return [{ label: value, value }, ...options];
}

export function displayFieldValue(field: SettingField): string {
	if (field.kind === 'switch') {
		return field.checked ? 'Enabled' : 'Disabled';
	}

	if (field.kind === 'select') {
		return field.options.find((option) => option.value === field.value)?.label ?? field.value;
	}

	return field.value.length === 0 ? 'Not set' : field.value;
}

export function collectionTimingModeFromFields(
	fields: readonly SettingField[],
): AdultCollectionTimingMode {
	const field = fields.find(
		(item): item is SelectSettingField =>
			item.kind === 'select' && item.label === 'Collection timing',
	);
	return field?.value === 'collection_date_duration'
		? 'collection_date_duration'
		: 'exact_timestamps';
}

export function findCurrentOrganization(
	organizations: readonly OrganizationRow[],
	auth: AuthMe | null,
): OrganizationRow | null {
	const organizationId = auth?.authenticated === true ? auth.localIdentity.organizationId : null;
	return (
		organizations.find((organization) => organization.id === organizationId) ??
		organizations[0] ??
		null
	);
}

export function readOrganizationFallback(auth: AuthMe | null): OrganizationFallback {
	if (auth?.authenticated !== true) {
		return {};
	}

	return {
		...(auth.localIdentity.organizationName === undefined
			? {}
			: { name: auth.localIdentity.organizationName }),
		...(auth.localIdentity.organizationSlug === undefined
			? {}
			: { slug: auth.localIdentity.organizationSlug }),
	};
}

export function readRole(auth: AuthMe | null): OrgRole {
	if (auth?.authenticated !== true) {
		return 'viewer';
	}
	const role = auth.localIdentity.role;
	return role === 'owner' ||
		role === 'admin' ||
		role === 'manager' ||
		role === 'collector' ||
		role === 'viewer'
		? role
		: 'viewer';
}

export function formatMode(value: string): string {
	return value
		.split(/[_-]/g)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}
