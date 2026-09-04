import type {
	AdultCollectionTimingMode,
	LarvalDensity,
	LarvalDensityRange,
	LarvalDensityRanges,
	OrganizationSettings,
	RangeDensity,
	ServiceRequestContextSettings,
	UnitDefaults,
} from '@simmer-mosquito/domain';
import type { Organization } from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { toast } from 'sonner';
import type { AgencyDetailsFields } from '../../../hooks/mutations/use-organization-settings-mutations';
import type { UnitLabel } from '../../../hooks/queries/use-unit-labels';
import { titleCaseToken } from '../../../lib/record-display';
import { errorMessageForSave } from '../../../lib/save-error';
import { defaultDensityRangeValues } from './constants';
import type {
	AgencyDetailsFormValues,
	DensityRangeFormValue,
	DensityRangeFormValues,
	PublicSettingsFormValues,
	SelectOption,
	SelectSettingField,
	SettingField,
	SimmerRole,
	TextSettingField,
	UnitDefaultsFormValues,
} from './types';

export function formatRole(role: SimmerRole): string {
	return role.charAt(0).toUpperCase() + role.slice(1);
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
			<span className="text-xs font-medium text-muted-foreground">{label}</span>
			<span className="font-medium wrap-anywhere text-sm leading-normal text-foreground">
				{value === undefined || value === null || value.length === 0 ? 'Not set' : value}
			</span>
		</p>
	);
}

export function formatMailingAddress(organization: Organization): string {
	const parts = [
		organization.mailing_address_line_1,
		organization.mailing_address_line_2,
		organization.mailing_locality,
		organization.mailing_region,
		organization.mailing_postal_code,
		organization.mailing_country,
	].filter((part): part is string => typeof part === 'string' && part.length > 0);

	return parts.length === 0 ? 'Not set' : parts.join(', ');
}

export function agencyDetailsFormValues(
	organization: Organization,
	settings: OrganizationSettings,
): AgencyDetailsFormValues {
	return {
		name: organization.name,
		mainContactEmail: organization.main_contact_email ?? '',
		phoneNumber: organization.phone_number ?? '',
		mailingAddressLine1: organization.mailing_address_line_1 ?? '',
		mailingAddressLine2: organization.mailing_address_line_2 ?? '',
		mailingLocality: organization.mailing_locality ?? '',
		mailingRegion: organization.mailing_region ?? '',
		mailingPostalCode: organization.mailing_postal_code ?? '',
		timezone: settings.timezone,
	};
}

/**
 * What the details sheet typed, as the write takes it.
 *
 * The form holds strings because an emptied input is `''`; the columns are
 * nullable because an agency that has no second address line has none. Trimming
 * and that conversion is the whole of what a form owes a write — every other
 * rule about these values belongs to the domain, which is what the seven routes
 * run.
 */
export function agencyDetailsFieldsFrom(values: AgencyDetailsFormValues): AgencyDetailsFields {
	return {
		name: requiredTextValue(values.name, 'Organization name'),
		mainContactEmail: nullableTextValue(values.mainContactEmail),
		phoneNumber: nullableTextValue(values.phoneNumber),
		mailingAddressLine1: nullableTextValue(values.mailingAddressLine1),
		mailingAddressLine2: nullableTextValue(values.mailingAddressLine2),
		mailingLocality: nullableTextValue(values.mailingLocality),
		mailingRegion: nullableTextValue(values.mailingRegion),
		mailingPostalCode: nullableTextValue(values.mailingPostalCode),
		timezone: requiredTextValue(values.timezone, 'Timezone'),
	};
}

export function unitDefaultsFormValues(unitDefaults: UnitDefaults): UnitDefaultsFormValues {
	return { ...unitDefaults };
}

export function unitDefaultsFrom(values: UnitDefaultsFormValues): UnitDefaults {
	return Object.fromEntries(
		Object.entries(values).map(([unitType, unitCode]) => [
			unitType,
			requiredTextValue(unitCode, titleCaseToken(unitType)),
		]),
	) as UnitDefaults;
}

/**
 * The service request context, from the four inputs that describe it.
 *
 * The radius may be fractional and the day windows may not, which is why they
 * are checked apart. The server checks the thing this cannot: that the unit code
 * names a distance unit that exists.
 */
export function serviceRequestContextFrom(
	values: PublicSettingsFormValues,
): ServiceRequestContextSettings {
	return {
		radius: {
			amount: nonnegativeNumberValue(values.radiusAmount, 'Related-record radius'),
			unitCode: requiredTextValue(values.radiusUnitCode, 'Radius unit'),
		},
		timeWindow: {
			daysBefore: nonnegativeIntegerValue(values.daysBefore, 'Days before'),
			daysAfter: nonnegativeIntegerValue(values.daysAfter, 'Days after'),
		},
	};
}

/**
 * Report a failed write, without holding the surface open for it.
 *
 * The hooks in `hooks/mutations` return a promise rather than a transaction —
 * they call `settleWrite` themselves, because naming the command is their job and
 * the caller has no transaction to hold. A form closes on submit and this is what
 * tells the user if the write it started did not land.
 */
export function watchWrite(write: Promise<unknown>, fallback: string): void {
	void write.catch((error) => {
		reportSaveFailure(error, fallback);
	});
}

/**
 * A refused write, said where the control that made it still is.
 *
 * A toast is the whole report for a surface that closed on submit, and it is not
 * enough for one that did not: the sheet stays open, the row reads the way it
 * read before, and nothing on it distinguishes a write that landed from one that
 * was refused (#219). `role="alert"` because the sheet holds focus and the reason
 * arrives after the click that asked for it.
 */
export function SaveErrorNote({ message }: { readonly message: string | null }) {
	if (message === null) {
		return null;
	}

	return (
		<p className="m-0 text-destructive text-sm leading-snug" role="alert">
			{message}
		</p>
	);
}

function reportSaveFailure(error: unknown, fallback: string): void {
	toast.error(saveFailureMessage(error, fallback));
}

/**
 * The refusal to show, or the caller's own words when there are none.
 *
 * `errorMessageForSave` answers for every write in the app, so its generic string
 * is what arrives whenever the thrown value carries nothing better. A caller that
 * knows which write it made says so instead.
 */
export function saveFailureMessage(error: unknown, fallback: string): string {
	const message = errorMessageForSave(error);
	return message === 'Unable to save changes.' ? fallback : message;
}

/**
 * A required choice, read out of the settings sheet's `FormData`.
 *
 * `EditSettingsSheet` renders its fields from a list and hands back a `FormData`
 * keyed by the label it drew, which is why the caller names the label rather
 * than a field.
 */
export function requiredFormText(formData: FormData, name: string): string {
	const value = formData.get(name);
	const text = typeof value === 'string' ? value.trim() : '';
	if (text.length === 0) {
		throw new Error(`${name} is required.`);
	}
	return text;
}

export function requiredTextValue(value: string, label: string): string {
	const text = value.trim();
	if (text.length === 0) {
		throw new Error(`${label} is required.`);
	}
	return text;
}

function nullableTextValue(value: string): string | null {
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

function _nullableNonnegativeIntegerValue(value: number | null, label: string): number | null {
	if (value === null) {
		return null;
	}

	if (!Number.isInteger(value) || value < 0) {
		throw new Error(`${label} must be a nonnegative whole number.`);
	}
	return value;
}

function nonnegativeNumberValue(value: number | null, label: string): number {
	if (value === null || !Number.isFinite(value) || value < 0) {
		throw new Error(`${label} must be zero or greater.`);
	}
	return value;
}

function nonnegativeIntegerValue(value: number | null, label: string): number {
	if (value === null || !Number.isInteger(value) || value < 0) {
		throw new Error(`${label} must be a nonnegative whole number.`);
	}
	return value;
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

function densityRangeFormValue(range: LarvalDensityRange): DensityRangeFormValue {
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

function densityRangeFromFormValue(
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

function validateDensityRangesForUi(ranges: LarvalDensityRanges): void {
	const sequence: Array<readonly [RangeDensity, LarvalDensityRange]> = [
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

function requiredFiniteNumber(value: string, label: string): number {
	const numberValue = Number(value);
	if (!Number.isFinite(numberValue) || numberValue < 0) {
		throw new Error(`${label} must be a number greater than or equal to zero.`);
	}
	return numberValue;
}

export function densityKeyForSettings(density: RangeDensity): keyof LarvalDensityRanges {
	return density === 'very_heavy' ? 'veryHeavy' : density;
}

export function densityLabel(density: LarvalDensity | string): string {
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
	units: readonly UnitLabel[],
): readonly SelectSettingField[] {
	return (Object.entries(unitDefaults) as Array<[keyof UnitDefaults, string]>).map(
		([unitType, code]) =>
			selectField(
				titleCaseToken(unitType),
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
	units: readonly UnitLabel[],
): readonly SelectOption[] {
	return [...units]
		.sort((first, second) => compareUnitsForSelect(code, first, second))
		.map(unitOption);
}

function compareUnitsForSelect(code: string, first: UnitLabel, second: UnitLabel): number {
	if (first.code === code || second.code === code) {
		return first.code === code ? -1 : 1;
	}

	return (
		first.unitSystem.localeCompare(second.unitSystem) ||
		first.unitName.localeCompare(second.unitName) ||
		first.code.localeCompare(second.code)
	);
}

function unitOption(unit: UnitLabel): SelectOption {
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
