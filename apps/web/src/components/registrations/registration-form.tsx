import { createNotificationRegistrationCommand } from '@simmer-mosquito/domain';
import { FormSection, LocationSection } from '@simmer-mosquito/ui-web/components/form';
import { Checkbox } from '@simmer-mosquito/ui-web/components/ui/checkbox';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import { useId } from 'react';
import type { DrawLocation } from '../../hooks/map/use-draw-location';
import type { DrawGeometry, DrawGeometryType } from '../../hooks/map/use-map-draw';
import type { UnitLabel } from '../../hooks/queries/use-unit-labels';
import { domainValidator, FORM_VALIDATION_CONTEXT } from '../../lib/domain-validation';
import { unitOptions } from '../../lib/unit-options';
import type { MapDrawController } from '../map/draw-controller';
import { GeometryControl } from '../map/geometry-control';
import { type AddressOption, AddressPicker } from '../pickers/address-picker';
import type { RequestMapPoint } from '../pickers/new-address-form';

/**
 * What a form holds, which is strings where the command takes numbers and
 * ids. An empty `bufferDistance` means no buffer rather than zero, and both
 * halves of the buffer are kept together because a distance with no unit is
 * not a buffer.
 */
export interface RegistrationFormValues {
	readonly contactId: string | null;
	readonly addressId: string | null;
	readonly bufferDistance: string;
	readonly bufferUnitId: string;
	readonly hasBees: boolean;
	readonly isNoSpray: boolean;
	/** The notification types this registration wants telling about. */
	readonly notificationTypeIds: readonly string[];
}

export function defaultRegistrationFormValues(): RegistrationFormValues {
	return {
		contactId: null,
		addressId: null,
		bufferDistance: '',
		bufferUnitId: '',
		hasBees: false,
		isNoSpray: false,
		notificationTypeIds: [],
	};
}

/** The buffer as the write seam takes it: both halves, or neither. */
export function bufferFrom(
	values: RegistrationFormValues,
): { readonly distance: number; readonly unitId: string } | null {
	const distance = Number.parseFloat(values.bufferDistance);
	if (values.bufferDistance.trim() === '' || Number.isNaN(distance) || values.bufferUnitId === '') {
		return null;
	}
	return { distance, unitId: values.bufferUnitId };
}

/** Domain issue path to the form field holding it. */
const REGISTRATION_FIELD_PATHS: Readonly<Record<string, string>> = {
	'contact.contactId': 'contactId',
	'location.address.addressId': 'addressId',
	'location.geometry': 'addressId',
	bufferDistance: 'bufferDistance',
	bufferUnitId: 'bufferUnitId',
};

/**
 * The create builder's rules, run against what the form holds. The purpose
 * rule is not a field rule: a registration has to be for something, and the
 * three things it can be for sit in two sections.
 */
export function validateRegistration(value: RegistrationFormValues, geometry: DrawGeometry | null) {
	return domainValidator(
		() =>
			createNotificationRegistrationCommand({
				...FORM_VALIDATION_CONTEXT,
				notificationRegistrationId: FORM_VALIDATION_CONTEXT.organizationId,
				contact: { kind: 'existing', contactId: value.contactId ?? '' },
				location: {
					address:
						value.addressId === null
							? { kind: 'none' }
							: { kind: 'existing', addressId: value.addressId },
					geometry: (geometry ?? null) as never,
				},
				bufferDistance: bufferFrom(value)?.distance ?? null,
				bufferUnitId: bufferFrom(value)?.unitId ?? null,
				hasBees: value.hasBees,
				isNoSpray: value.isNoSpray,
				subscriptions: value.notificationTypeIds.map((notificationTypeId) => ({
					notificationRegistrationTypeId: FORM_VALIDATION_CONTEXT.organizationId,
					notificationTypeId,
				})),
			}),
		REGISTRATION_FIELD_PATHS,
	)({ value });
}

/** What the panel form needs beyond the form instance itself. */
export interface RegistrationFormFieldsProps {
	// biome-ignore lint/suspicious/noExplicitAny: useAppForm instance has no exported type
	readonly form: any;
	readonly organizationId: string;
	readonly units: readonly UnitLabel[];
	readonly notificationTypes: readonly { readonly id: string; readonly label: string }[];
	readonly location: DrawLocation;
}

/**
 * A registration's fields, without a page around them: the map belongs to the
 * page. The contact is not among them, because this is only reached from the
 * contact it belongs to.
 */
export function RegistrationFormFields({
	form,
	location,
	notificationTypes,
	organizationId,
	units,
}: RegistrationFormFieldsProps) {
	const { draw, geometry, geometryType } = location;

	// Distance only. A select that offers gallons is a select somebody picks
	// gallons from, and the refusal blocks generation for every mission.
	const bufferUnitOptions = unitOptions(units, (unitType) => unitType === 'distance');

	return (
		<>
			<RegistrationLocation
				addressCoord={location.addressCoord}
				controller={draw}
				form={form}
				geometry={geometry}
				geometryType={geometryType}
				locationError={location.locationError}
				onAddressSelected={location.selectAddress}
				onClear={location.clear}
				onDraw={location.startDraw}
				onMoveToAddress={location.moveToAddress}
				onTypeChange={location.changeType}
				organizationId={organizationId}
				requestMapPoint={location.requestMapPoint}
			/>

			<FormSection title="Buffer">
				<div className="grid gap-4">
					<form.AppField name="bufferDistance">
						{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
						{(field: any) => (
							<field.TextField
								description="Leave empty to warn only for the geometry itself."
								inputMode="decimal"
								label="Distance"
								placeholder="e.g. 500"
							/>
						)}
					</form.AppField>
					<form.AppField name="bufferUnitId">
						{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
						{(field: any) => (
							<field.SelectField
								label="Unit"
								options={bufferUnitOptions}
								placeholder="Select a distance unit"
							/>
						)}
					</form.AppField>
				</div>
			</FormSection>

			<PurposeSection form={form} notificationTypes={notificationTypes} />
		</>
	);
}

/**
 * Where the registration is, as the boxed band every located record uses. A
 * box because the controls in it move each other.
 */
function RegistrationLocation({
	addressCoord,
	controller,
	form,
	geometry,
	geometryType,
	locationError,
	onAddressSelected,
	onClear,
	onDraw,
	onMoveToAddress,
	onTypeChange,
	organizationId,
	requestMapPoint,
}: {
	readonly addressCoord: { readonly lat: number; readonly lng: number } | null;
	readonly controller: MapDrawController;
	// biome-ignore lint/suspicious/noExplicitAny: useAppForm instance has no exported type
	readonly form: any;
	readonly geometry: DrawGeometry | null;
	readonly geometryType: DrawGeometryType;
	readonly locationError: string | null;
	readonly onAddressSelected: (address: AddressOption | null) => void;
	readonly onClear: () => void;
	readonly onDraw: () => void;
	readonly onMoveToAddress: () => void;
	readonly onTypeChange: (next: DrawGeometryType) => void;
	readonly organizationId: string;
	readonly requestMapPoint: RequestMapPoint;
}) {
	return (
		<LocationSection error={locationError}>
			<form.AppField name="addressId">
				{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
				{(field: any) => (
					<AddressPicker
						create={{ requestMapPoint }}
						onSelect={(address: AddressOption | null) => {
							field.handleChange(address?.id ?? null);
							onAddressSelected(address);
						}}
						value={field.state.value}
					/>
				)}
			</form.AppField>

			<GeometryControl
				controller={controller}
				geometry={geometry}
				geometryType={geometryType}
				geometryKind="notificationRegistration"
				label="Geometry"
				required
				onClear={onClear}
				onDraw={onDraw}
				onTypeChange={onTypeChange}
				organizationId={organizationId}
				{...(addressCoord === null ? {} : { onMoveToAddress })}
			/>
		</LocationSection>
	);
}

/**
 * What the registration is for, which is the one thing it cannot be without.
 * The three purposes sit in one section because the domain's rule is about
 * all of them together.
 */
function PurposeSection({
	form,
	notificationTypes,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: useAppForm instance has no exported type
	readonly form: any;
	readonly notificationTypes: readonly { readonly id: string; readonly label: string }[];
}) {
	const beesId = useId();
	const noSprayId = useId();

	return (
		<FormSection
			note="A registration needs at least one of these: a warning flag, or a notification type."
			title="What to Warn About"
		>
			<div className="grid gap-3">
				<form.AppField name="hasBees">
					{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
					{(field: any) => (
						<div className="flex items-start gap-3">
							<Checkbox
								checked={field.state.value}
								className="mt-0.5"
								id={beesId}
								onCheckedChange={(value) => field.handleChange(value === true)}
							/>
							<Label className="font-normal leading-snug" htmlFor={beesId}>
								Bees are kept here
							</Label>
						</div>
					)}
				</form.AppField>
				<form.AppField name="isNoSpray">
					{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
					{(field: any) => (
						<div className="flex items-start gap-3">
							<Checkbox
								checked={field.state.value}
								className="mt-0.5"
								id={noSprayId}
								onCheckedChange={(value) => field.handleChange(value === true)}
							/>
							<Label className="font-normal leading-snug" htmlFor={noSprayId}>
								Do not spray here
							</Label>
						</div>
					)}
				</form.AppField>
			</div>

			<form.AppField name="notificationTypeIds">
				{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
				{(field: any) => (
					<fieldset className="grid gap-3">
						<legend className="font-semibold text-foreground text-sm">Notification types</legend>
						{notificationTypes.length === 0 ? (
							<p className="text-muted-foreground text-sm">No notification types are set up yet.</p>
						) : (
							notificationTypes.map((type) => (
								<NotificationTypeCheckbox
									checked={field.state.value.includes(type.id)}
									key={type.id}
									label={type.label}
									onToggle={(checked) =>
										field.handleChange(
											checked
												? [...field.state.value, type.id]
												: field.state.value.filter((id: string) => id !== type.id),
										)
									}
								/>
							))
						)}
					</fieldset>
				)}
			</form.AppField>
		</FormSection>
	);
}

function NotificationTypeCheckbox({
	checked,
	label,
	onToggle,
}: {
	readonly checked: boolean;
	readonly label: string;
	readonly onToggle: (checked: boolean) => void;
}) {
	const id = useId();
	return (
		<div className="flex items-start gap-3">
			<Checkbox
				checked={checked}
				className="mt-0.5"
				id={id}
				onCheckedChange={(value) => onToggle(value === true)}
			/>
			<Label className="font-normal leading-snug" htmlFor={id}>
				{label}
			</Label>
		</div>
	);
}
