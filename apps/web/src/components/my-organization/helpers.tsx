import type {
	LarvalDensity,
	LarvalDensityRange,
	LarvalDensityRanges,
	OrganizationSettings,
	RangeDensity,
	ResolvedLarvalInspectionEntryPolicy,
	ServiceRequestContextSettings,
	UnitDefaults,
} from '@simmer-mosquito/domain';
import type { Organization } from '@simmer-mosquito/sync';
import { toast } from 'sonner';
import type { OrganizationDetailsFields } from '../../hooks/mutations/use-organization-settings-mutations';
import type { UnitLabel } from '../../hooks/queries/use-unit-labels';
import { titleCaseToken } from '../../lib/record-display';
import { errorMessageForSave } from '../../lib/save-error';
import { defaultDensityRangeValues } from './constants';
import type {
	DensityRangeFormValue,
	DensityRangeFormValues,
	DisplaySettingField,
	LarvalSettingsFormValues,
	OrganizationDetailsFormValues,
	PublicSettingsFormValues,
	SelectOption,
	SimmerRole,
	UnitDefaultsFormValues,
} from './types';

export function formatRole(role: SimmerRole): string {
	return role.charAt(0).toUpperCase() + role.slice(1);
}

export function OrganizationDetailLine({
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

export function organizationDetailsFormValues(
	organization: Organization,
	settings: OrganizationSettings,
): OrganizationDetailsFormValues {
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
 * What the details sheet typed, as the write takes it: trimmed, with an
 * emptied input as `null`. Every other rule about these values is the
 * domain's.
 */
export function organizationDetailsFieldsFrom(
	values: OrganizationDetailsFormValues,
): OrganizationDetailsFields {
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
 * The service request context, from the four inputs that describe it. The
 * radius must be greater than zero and may be fractional, which is the domain
 * builder's rule, and the day windows are whole numbers from zero. An empty
 * input arrives as `null` and is refused rather than read as zero. Each
 * message names the field by the label the sheet draws. The server checks
 * that the unit code names a distance unit that exists.
 */
export function serviceRequestContextFrom(
	values: PublicSettingsFormValues,
): ServiceRequestContextSettings {
	return {
		radius: {
			amount: positiveNumberValue(values.radiusAmount, 'Search radius'),
			unitCode: requiredTextValue(values.radiusUnitCode, 'Radius unit'),
		},
		timeWindow: {
			daysBefore: nonnegativeIntegerValue(values.daysBefore, 'Days before'),
			daysAfter: nonnegativeIntegerValue(values.daysAfter, 'Days after'),
		},
	};
}

/**
 * Report a failed write, without holding the surface open for it. The hooks in
 * `hooks/mutations` return a promise rather than a transaction, and a form
 * that closed on submit has nothing else to tell the user with.
 */
export function watchWrite(write: Promise<unknown>, fallback: string): void {
	void write.catch((error) => {
		reportSaveFailure(error, fallback);
	});
}

/**
 * A refused write, said where the control that made it still is. A toast is
 * not enough for a sheet that stays open. `role="alert"` because the sheet
 * holds focus and the reason arrives after the click.
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
 * `errorMessageForSave`'s generic string arrives whenever the thrown value
 * carries nothing better.
 */
export function saveFailureMessage(error: unknown, fallback: string): string {
	const message = errorMessageForSave(error);
	return message === 'Unable to save changes.' ? fallback : message;
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

/**
 * A number input's text, with an empty one as `null`. `Number('')` is 0, so
 * reading the text straight through would save a cleared field as zero.
 */
export function numberInputValue(value: string | null): number | null {
	const text = typeof value === 'string' ? value.trim() : '';
	return text.length === 0 ? null : Number(text);
}

function positiveNumberValue(value: number | null, label: string): number {
	if (value === null) {
		throw new Error(`${label} is required.`);
	}
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${label} must be greater than zero.`);
	}
	return value;
}

function nonnegativeIntegerValue(value: number | null, label: string): number {
	if (value === null) {
		throw new Error(`${label} is required.`);
	}
	if (!Number.isInteger(value) || value < 0) {
		throw new Error(`${label} must be a nonnegative whole number.`);
	}
	return value;
}

function densityRangeFormValues(ranges: LarvalDensityRanges | null): DensityRangeFormValues {
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

/**
 * The density bands to save, or `null` when the Organization keys plain
 * counts. The branch lives here rather than at the call site, which is inside
 * a try block the React Compiler cannot lower with a branch in it. Throwing is
 * the point: an out-of-order band has to refuse the save.
 */
export function densityRangesOrNull(
	enabled: boolean,
	values: DensityRangeFormValues,
): LarvalDensityRanges | null {
	if (!enabled) {
		return null;
	}
	return densityRangesFromFormValues(values);
}

/** What the larval sheet opens with, from the policy the Organization saved. */
export function larvalSettingsFormValues(
	policy: ResolvedLarvalInspectionEntryPolicy,
): LarvalSettingsFormValues {
	return {
		mode: policy.mode,
		densityEnabled: policy.densityRanges !== null,
		ranges: densityRangeFormValues(policy.densityRanges),
	};
}

/**
 * The entry policy to save. Throws, naming the band and the field, on a
 * density bound it cannot read or one out of order.
 */
export function larvalEntryPolicyFrom(
	values: LarvalSettingsFormValues,
): ResolvedLarvalInspectionEntryPolicy {
	return {
		mode: values.mode,
		densityRanges: densityRangesOrNull(values.densityEnabled, values.ranges),
	};
}

function densityRangesFromFormValues(values: DensityRangeFormValues): LarvalDensityRanges {
	const ranges = {
		light: densityRangeFromFormValue(values.light, 'light'),
		medium: densityRangeFromFormValue(values.medium, 'medium'),
		heavy: densityRangeFromFormValue(values.heavy, 'heavy'),
		veryHeavy: {
			minInclusive: densityBoundValue(
				values.very_heavy.minInclusive,
				densityFieldName('very_heavy', 'minInclusive'),
			),
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
	density: RangeDensity,
): LarvalDensityRange {
	const minInclusive =
		density === 'light'
			? 0
			: densityBoundValue(value.minInclusive, densityFieldName(density, 'minInclusive'));
	return {
		minInclusive,
		maxExclusive: densityBoundValue(value.maxExclusive, densityFieldName(density, 'maxExclusive')),
	};
}

/**
 * A density bound named the way the sheet draws it, by the field label inside
 * the band's fieldset, so a person can find the field a message is about.
 */
function densityFieldName(density: RangeDensity, bound: keyof DensityRangeFormValue): string {
	const field = bound === 'minInclusive' ? 'Greater than' : 'Up to and including';
	return `${field} in ${densityLabel(density)}`;
}

function validateDensityRangesForUi(ranges: LarvalDensityRanges): void {
	const sequence: Array<readonly [RangeDensity, LarvalDensityRange]> = [
		['light', ranges.light],
		['medium', ranges.medium],
		['heavy', ranges.heavy],
		['very_heavy', ranges.veryHeavy],
	];
	let previous: RangeDensity | null = null;
	let previousMax: number | null = null;
	for (const [density, range] of sequence) {
		const greaterThan = densityFieldName(density, 'minInclusive');
		if (previous !== null && range.minInclusive !== previousMax) {
			throw new Error(`${greaterThan} must equal ${densityFieldName(previous, 'maxExclusive')}.`);
		}
		if (
			range.maxExclusive !== null &&
			range.maxExclusive !== undefined &&
			range.maxExclusive <= range.minInclusive
		) {
			throw new Error(
				`${densityFieldName(density, 'maxExclusive')} must be more than ${greaterThan}.`,
			);
		}
		previous = density;
		previousMax = range.maxExclusive ?? null;
	}
}

/**
 * A bound the person typed, refused by name when it is empty, blank, negative
 * or not a number. Empty is checked first, because `Number('')` is 0 and would
 * otherwise reach the band ordering check and be blamed on the wrong rule.
 */
function densityBoundValue(text: string, field: string): number {
	const value = numberInputValue(text);
	if (value === null) {
		throw new Error(`${field} is required.`);
	}
	if (!Number.isFinite(value) || value < 0) {
		throw new Error(`${field} must be a number of 0 or more.`);
	}
	return value;
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

function selectField(
	label: string,
	value: string,
	options: readonly SelectOption[],
): DisplaySettingField {
	return {
		label,
		value,
		options: selectOptionsForValue(value, options),
	};
}

export function unitDefaultFields(
	unitDefaults: UnitDefaults,
	units: readonly UnitLabel[],
): readonly DisplaySettingField[] {
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

export function displayFieldValue(field: DisplaySettingField): string {
	return field.options.find((option) => option.value === field.value)?.label ?? field.value;
}
