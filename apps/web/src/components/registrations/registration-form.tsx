import { createNotificationRegistrationCommand } from '@simmer-mosquito/domain';
import {
	FormSection,
	LocationSection,
	RecordFormPage,
	useAppForm,
} from '@simmer-mosquito/ui-web/components/form';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Checkbox } from '@simmer-mosquito/ui-web/components/ui/checkbox';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useId, useMemo, useState } from 'react';
import { domainValidator, FORM_VALIDATION_CONTEXT } from '../../forms/domain-validation';
import type { UnitLabel } from '../../hooks/queries/use-unit-labels';
import { unitOptions } from '../../lib/unit-options';
import { MapCanvas } from '../map';
import { DrawToolbar, GeometryControl } from '../map/geometry-control';
import { type DrawLocation, useDrawLocation } from '../map/use-draw-location';
import type { DrawGeometry, DrawGeometryType, MapDrawController } from '../map/use-map-draw';
import { type AddressOption, AddressPicker } from '../pickers/address-picker';
import { ContactPicker } from '../pickers/contact-picker';
import type { RequestMapPoint } from '../pickers/new-address-form';

/**
 * What a form holds, which is strings where the command takes numbers and ids.
 *
 * `bufferDistance` is a string because that is what a number input produces, and
 * an empty one means no buffer rather than zero. Both halves of the buffer are
 * kept together for the same reason the command takes them together: a distance
 * with no unit is not a buffer.
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
 * The create builder's rules, run against what the form holds.
 *
 * Worth running the real builder rather than restating its rules: the purpose
 * rule below is the one a form would get wrong, and it is not a field rule at
 * all. A registration has to be *for* something, and the three things it can be
 * for sit in two different sections, so no single field can carry the error.
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
 * A registration's fields, without a page around them.
 *
 * They sit in the results panel of the contact's manage page, beside the map
 * they draw on, which is why this is fields rather than a form: the map belongs
 * to the page, and a form that owned its own canvas would put a second map
 * beside the one already there.
 *
 * The contact is not among them. A registration is always somebody's, the column
 * is `not null`, and this is only ever reached from the contact it belongs to, so
 * a picker here would be a second answer to a question the route already settled.
 */
export function RegistrationFormFields({
	form,
	location,
	notificationTypes,
	organizationId,
	units,
}: RegistrationFormFieldsProps) {
	const { draw, geometry, geometryType } = location;

	// Distance only. The domain checks this server-side too, but a select that
	// offers gallons is a select somebody eventually picks gallons from, and the
	// refusal it causes blocks generation for every mission in the agency.
	const bufferUnitOptions = useMemo(
		() => unitOptions(units, (unitType) => unitType === 'distance'),
		[units],
	);

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
								description="How far past the geometry the warning reaches. Leave empty to warn only for the geometry itself."
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
 * The map half of a registration, as the shared record-form controller.
 *
 * The canvas belongs to the page, which draws every registration this contact
 * already has whether or not one is being edited, so the map is handed in rather
 * than claimed: a controller that owned the map would mean a second map beside
 * the one already on screen.
 */
export function useRegistrationLocation(
	map: MapboxMap | null,
	initialGeometry: DrawGeometry | null,
): DrawLocation {
	return useDrawLocation({
		initialGeometry,
		map,
		missingMessage: 'Draw the place this registration covers.',
	});
}

/**
 * Where the registration is, as the boxed band every located record uses.
 *
 * A box rather than a heading because the controls in it move each other:
 * picking an address can reframe the map and place the point, and changing the
 * geometry type replaces the shape. The border is what says they are one answer.
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
		<LocationSection
			description="The geometry is the place itself: a point for a house, a line for a verge, an area for a field. An address is optional reference."
			error={locationError}
		>
			<form.AppField name="addressId">
				{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
				{(field: any) => (
					<AddressPicker
						create={{ requestMapPoint }}
						onSelect={(address: AddressOption | null) => {
							field.handleChange(address?.id ?? null);
							onAddressSelected(address);
						}}
						organizationId={organizationId}
						value={field.state.value}
					/>
				)}
			</form.AppField>

			<GeometryControl
				controller={controller}
				geometry={geometry}
				geometryType={geometryType}
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
 *
 * The domain refuses a registration that is neither a bees warning, a no-spray
 * request, nor a subscription to anything, and those three sit in one section
 * because that rule is about all of them together. Split across two sections,
 * the refusal would arrive pointing at neither.
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
			title="What to warn about"
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
							<p className="text-muted-foreground text-sm">
								This agency has no notification types yet.
							</p>
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
