import { REQUEST_INTAKE_TYPES, type RequestIntakeType } from '@simmer-mosquito/domain';
import type { AddressRow, ProfileRow } from '@simmer-mosquito/sync';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { DatePicker } from '@simmer-mosquito/ui-web/components/ui/date-picker';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { ArrowLeftIcon, MapPinnedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { MapCanvas } from '../../../components/map';
import { type DrawGeometry, useMapDraw } from '../../../components/map/use-map-draw';
import { AddressPicker } from '../../../components/pickers/address-picker';
import { ContactPicker } from '../../../components/pickers/contact-picker';
import { useAppForm } from '../../../forms';
import { PointControl } from '../../adult-surveillance/traps/-trap-form';

export type ContactMode = 'existing' | 'new';
export type AddressMode = 'existing' | 'new';

export const INTAKE_TYPE_OPTIONS = REQUEST_INTAKE_TYPES.map((value: RequestIntakeType) => ({
	value,
	label: value === 'walk-in' ? 'Walk-in' : value.charAt(0).toUpperCase() + value.slice(1),
}));

export interface ServiceRequestFormValues {
	readonly intakeType: RequestIntakeType;
	readonly requestDate: string;
	readonly details: string;
	/** A profile id; defaults to the acting user. */
	readonly receivedByProfileId: string;
	readonly contactMode: ContactMode;
	readonly contactId: string | null;
	readonly newContactName: string;
	readonly newContactCompany: string;
	readonly newContactPhone: string;
	readonly newContactEmail: string;
	readonly addressMode: AddressMode;
	readonly addressId: string | null;
	readonly newAddressName: string;
	readonly newAddressLine1: string;
	readonly newAddressLocality: string;
	readonly newAddressRegion: string;
	readonly newAddressPostal: string;
}

export interface ServiceRequestSaveInput {
	readonly values: ServiceRequestFormValues;
	/** The request's own point. Always set on create; null when location is locked. */
	readonly geometry: DrawGeometry | null;
}

export interface ServiceRequestFormHeader {
	readonly title: string;
	readonly description: string;
	readonly backTo:
		| '/public-engagement/service-requests'
		| '/public-engagement/service-requests/$id';
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export interface ServiceRequestFormPageProps {
	readonly organizationId: string;
	readonly canSubmit: boolean;
	readonly profiles: readonly ProfileRow[];
	readonly defaultValues: ServiceRequestFormValues;
	/** Prefill the drawn point on edit; create starts with none. */
	readonly initialGeometry?: DrawGeometry | null;
	/** Whether a point must be placed to submit (create requires one). */
	readonly requireLocation?: boolean;
	/** Edit locks location: the address/point are fixed and their section is hidden. */
	readonly hideLocation?: boolean;
	/** Edit disables inline contact creation (existing contact only). */
	readonly disableNewContact?: boolean;
	readonly header: ServiceRequestFormHeader;
	readonly submitLabel: string;
	readonly onSave: (input: ServiceRequestSaveInput) => Promise<void>;
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
		newContactName: '',
		newContactCompany: '',
		newContactPhone: '',
		newContactEmail: '',
		addressMode: 'existing',
		addressId: null,
		newAddressName: '',
		newAddressLine1: '',
		newAddressLocality: '',
		newAddressRegion: '',
		newAddressPostal: '',
	};
}

export function ServiceRequestFormPage({
	organizationId,
	canSubmit,
	profiles,
	defaultValues,
	initialGeometry = null,
	requireLocation = true,
	hideLocation = false,
	disableNewContact = false,
	header,
	submitLabel,
	onSave,
}: ServiceRequestFormPageProps) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [geometry, setGeometry] = useState<DrawGeometry | null>(initialGeometry);
	const [addressCoord, setAddressCoord] = useState<{
		readonly lat: number;
		readonly lng: number;
	} | null>(null);
	const [locationError, setLocationError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);

	const handleMapReady = useCallback((instance: MapboxMap) => setMap(instance), []);
	const draw = useMapDraw({ map, isLoaded: map !== null, value: null, onChange: () => undefined });
	const { requestPoint } = draw;

	const activeProfiles = useMemo(() => profiles.filter((profile) => profile.isActive), [profiles]);

	const previewCoord =
		geometry !== null && geometry.type === 'Point'
			? { lat: geometry.coordinates[1], lng: geometry.coordinates[0] }
			: null;
	useFlyTo(map, previewCoord);

	const previewGeoJson =
		previewCoord === null
			? null
			: ({
					type: 'Feature',
					properties: {},
					geometry: { type: 'Point', coordinates: [previewCoord.lng, previewCoord.lat] },
				} as GeoJSON.Feature);

	// Selecting an address never overwrites a placed point — it frames the map and,
	// when no point exists yet, seeds one at the address so the request has a start.
	const handleAddressSelected = useCallback((address: AddressRow | null) => {
		setLocationError(null);
		if (address === null || typeof address.lat !== 'number' || typeof address.lng !== 'number') {
			setAddressCoord(null);
			return;
		}
		const coord = { lat: address.lat, lng: address.lng };
		setAddressCoord(coord);
		setGeometry((current) =>
			current === null ? { type: 'Point', coordinates: [coord.lng, coord.lat] } : current,
		);
	}, []);

	const requestRequestPoint = useCallback(async () => {
		setLocationError(null);
		try {
			const point = await requestPoint('Click the map to place the request location.');
			setGeometry(point);
		} catch {
			// Draw cancelled (Esc / mode switch); keep the prior point.
		}
	}, [requestPoint]);

	const moveToAddress = useCallback(() => {
		if (addressCoord === null) {
			return;
		}
		setGeometry({ type: 'Point', coordinates: [addressCoord.lng, addressCoord.lat] });
	}, [addressCoord]);

	const clearPoint = useCallback(() => setGeometry(null), []);

	const form = useAppForm({
		defaultValues,
		onSubmit: async ({ value }) => {
			setSaveError(null);
			setLocationError(null);
			const error = validateServiceRequestForm(value, { hideLocation, disableNewContact });
			if (error !== null) {
				setSaveError(error);
				return;
			}
			if (!hideLocation && requireLocation && geometry === null) {
				setLocationError('Place the request location on the map.');
				return;
			}
			try {
				await onSave({ values: value, geometry: hideLocation ? null : geometry });
			} catch (thrown) {
				setSaveError(thrown instanceof Error ? thrown.message : 'Unable to save service request.');
			}
		},
	});

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						controls={{ layers: false }}
						geoJson={previewGeoJson}
						onMapReady={handleMapReady}
					/>
					{draw.isRequestingPoint ? (
						<MapPrompt>
							<MapPinnedIcon aria-hidden="true" className="size-4 text-primary" />
							Click the map to place the request location. Press Esc to cancel.
						</MapPrompt>
					) : null}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<header className="sticky top-0 z-10 grid gap-2 border-border/50 border-b bg-background/95 px-5 py-4 backdrop-blur-sm">
					<Link
						className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
						params={header.backParams ?? {}}
						to={header.backTo}
					>
						<ArrowLeftIcon aria-hidden="true" />
						{header.backLabel}
					</Link>
					<div className="grid gap-1">
						<h1 className="m-0 font-semibold text-foreground text-xl leading-tight">
							{header.title}
						</h1>
						<p className="m-0 text-muted-foreground text-sm">{header.description}</p>
					</div>
				</header>

				<div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
					<form.AppForm>
						<form
							className="grid gap-6"
							onSubmit={(event) => {
								event.preventDefault();
								void form.handleSubmit();
							}}
						>
							<form.FormErrorAlert title="Unable to save service request" />
							{saveError === null ? null : (
								<Alert variant="destructive">
									<AlertTitle>Unable to save service request</AlertTitle>
									<AlertDescription>{saveError}</AlertDescription>
								</Alert>
							)}

							<ContactSection
								disableNewContact={disableNewContact}
								form={form}
								organizationId={organizationId}
							/>

							{hideLocation ? null : (
								<LocationSection
									addressCoord={addressCoord}
									form={form}
									geometry={geometry}
									isDrawing={draw.isRequestingPoint}
									locationError={locationError}
									onClearPoint={clearPoint}
									onAddressSelected={handleAddressSelected}
									onMoveToAddress={moveToAddress}
									onRequestPoint={requestRequestPoint}
									organizationId={organizationId}
								/>
							)}

							<FormSection title="Request">
								<div className="grid gap-5 sm:grid-cols-2">
									<form.AppField name="intakeType">
										{(field) => (
											<field.SelectField
												label="Intake type"
												options={INTAKE_TYPE_OPTIONS}
												placeholder="Select intake type"
											/>
										)}
									</form.AppField>
									<form.AppField name="requestDate">
										{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
										{(field: any) => (
											<DateControl
												label="Request date"
												onChange={(next) => field.handleChange(next ?? '')}
												value={field.state.value}
											/>
										)}
									</form.AppField>
								</div>
								<form.AppField name="receivedByProfileId">
									{(field) => (
										<field.SelectField
											label="Received by"
											options={activeProfiles.map((profile) => ({
												label: profile.displayName,
												value: profile.id,
											}))}
											placeholder="Select a profile"
										/>
									)}
								</form.AppField>
								<form.AppField name="details">
									{(field) => (
										<field.TextareaField
											description="What the caller reported — location details, mosquito activity, standing water, etc."
											label="Details"
											placeholder="Describe the request…"
											rows={4}
										/>
									)}
								</form.AppField>
							</FormSection>

							<div className="border-border/50 border-t pt-5">
								<form.FormActions>
									<form.ResetButton />
									<form.SubmitButton disabled={!canSubmit}>{submitLabel}</form.SubmitButton>
								</form.FormActions>
							</div>
						</form>
					</form.AppForm>
				</div>
			</div>
		</MapSplitPage>
	);
}

// --- sections ---------------------------------------------------------------

function ContactSection({
	form,
	organizationId,
	disableNewContact,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: useAppForm instance has no exported type
	readonly form: any;
	readonly organizationId: string;
	readonly disableNewContact: boolean;
}) {
	return (
		<FormSection title="Contact">
			{disableNewContact ? null : (
				<form.AppField name="contactMode">
					{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
					{(field: any) => (
						<ToggleGroup
							aria-label="Contact source"
							className="w-full"
							onValueChange={(next: string) => {
								if (next === 'existing' || next === 'new') {
									field.handleChange(next);
								}
							}}
							size="sm"
							type="single"
							value={field.state.value}
							variant="outline"
						>
							<ToggleGroupItem className="flex-1 text-xs" value="existing">
								Existing contact
							</ToggleGroupItem>
							<ToggleGroupItem className="flex-1 text-xs" value="new">
								New contact
							</ToggleGroupItem>
						</ToggleGroup>
					)}
				</form.AppField>
			)}

			<form.Subscribe
				selector={(state: { values: ServiceRequestFormValues }) => state.values.contactMode}
			>
				{(contactMode: ContactMode) =>
					contactMode === 'existing' || disableNewContact ? (
						<form.AppField name="contactId">
							{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
							{(field: any) => (
								<ContactPicker
									onSelect={(contact) => field.handleChange(contact?.id ?? null)}
									organizationId={organizationId}
									value={field.state.value}
								/>
							)}
						</form.AppField>
					) : (
						<div className="grid gap-5 rounded-md border border-border/50 bg-muted/30 p-4">
							<p className="m-0 text-muted-foreground text-xs">
								Enter at least one identifier — a name, company, phone, or email.
							</p>
							<div className="grid gap-5 sm:grid-cols-2">
								<form.AppField name="newContactName">
									{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
									{(field: any) => (
										<field.TextField label="Name" placeholder="e.g. Jordan Rivera" />
									)}
								</form.AppField>
								<form.AppField name="newContactCompany">
									{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
									{(field: any) => (
										<field.TextField label="Company" placeholder="e.g. Riverside HOA" />
									)}
								</form.AppField>
								<form.AppField name="newContactPhone">
									{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
									{(field: any) => <field.TextField label="Phone" placeholder="(555) 123-4567" />}
								</form.AppField>
								<form.AppField name="newContactEmail">
									{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
									{(field: any) => <field.TextField label="Email" placeholder="name@example.com" />}
								</form.AppField>
							</div>
						</div>
					)
				}
			</form.Subscribe>
		</FormSection>
	);
}

function LocationSection({
	form,
	organizationId,
	geometry,
	isDrawing,
	addressCoord,
	locationError,
	onAddressSelected,
	onRequestPoint,
	onMoveToAddress,
	onClearPoint,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: useAppForm instance has no exported type
	readonly form: any;
	readonly organizationId: string;
	readonly geometry: DrawGeometry | null;
	readonly isDrawing: boolean;
	readonly addressCoord: { readonly lat: number; readonly lng: number } | null;
	readonly locationError: string | null;
	readonly onAddressSelected: (address: AddressRow | null) => void;
	readonly onRequestPoint: () => void;
	readonly onMoveToAddress: () => void;
	readonly onClearPoint: () => void;
}) {
	return (
		<FormSection title="Location">
			<form.AppField name="addressMode">
				{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
				{(field: any) => (
					<ToggleGroup
						aria-label="Address source"
						className="w-full"
						onValueChange={(next: string) => {
							if (next === 'existing' || next === 'new') {
								field.handleChange(next);
							}
						}}
						size="sm"
						type="single"
						value={field.state.value}
						variant="outline"
					>
						<ToggleGroupItem className="flex-1 text-xs" value="existing">
							Existing address
						</ToggleGroupItem>
						<ToggleGroupItem className="flex-1 text-xs" value="new">
							New address
						</ToggleGroupItem>
					</ToggleGroup>
				)}
			</form.AppField>

			<form.Subscribe
				selector={(state: { values: ServiceRequestFormValues }) => state.values.addressMode}
			>
				{(addressMode: AddressMode) =>
					addressMode === 'existing' ? (
						<form.AppField name="addressId">
							{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
							{(field: any) => (
								<AddressPicker
									onSelect={(address: AddressRow | null) => {
										field.handleChange(address?.id ?? null);
										onAddressSelected(address);
									}}
									organizationId={organizationId}
									value={field.state.value}
								/>
							)}
						</form.AppField>
					) : (
						<div className="grid gap-5 rounded-md border border-border/50 bg-muted/30 p-4">
							<p className="m-0 text-muted-foreground text-xs">
								A new address is created from these fields and the point below.
							</p>
							<form.AppField name="newAddressName">
								{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
								{(field: any) => (
									<field.TextField label="Address name" placeholder="e.g. 120 Marsh Ln" />
								)}
							</form.AppField>
							<form.AppField name="newAddressLine1">
								{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
								{(field: any) => (
									<field.TextField label="Street (optional)" placeholder="120 Marsh Ln" />
								)}
							</form.AppField>
							<div className="grid gap-5 sm:grid-cols-3">
								<form.AppField name="newAddressLocality">
									{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
									{(field: any) => <field.TextField label="City (optional)" placeholder="City" />}
								</form.AppField>
								<form.AppField name="newAddressRegion">
									{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
									{(field: any) => <field.TextField label="State (optional)" placeholder="ST" />}
								</form.AppField>
								<form.AppField name="newAddressPostal">
									{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
									{(field: any) => <field.TextField label="ZIP (optional)" placeholder="00000" />}
								</form.AppField>
							</div>
						</div>
					)
				}
			</form.Subscribe>

			<section
				aria-label="Request point"
				className={cn(
					'grid gap-4 rounded-md border bg-muted/30 p-4',
					locationError === null ? 'border-border/50' : 'border-destructive/60',
				)}
			>
				<p className="m-0 text-muted-foreground text-xs">
					The point is the request’s exact location. Use an address to frame the map, then refine
					the point to the precise spot.
				</p>
				<PointControl
					canMoveToAddress={addressCoord !== null}
					geometry={geometry}
					isDrawing={isDrawing}
					onClear={onClearPoint}
					onMoveToAddress={onMoveToAddress}
					onRequestPoint={onRequestPoint}
				/>
				{locationError === null ? null : (
					<p className="m-0 text-destructive text-sm">{locationError}</p>
				)}
			</section>
		</FormSection>
	);
}

// --- validation -------------------------------------------------------------

export function validateServiceRequestForm(
	values: ServiceRequestFormValues,
	options: { readonly hideLocation: boolean; readonly disableNewContact: boolean },
): string | null {
	if (values.details.trim().length === 0) {
		return 'Enter the request details.';
	}
	if (values.receivedByProfileId.trim().length === 0) {
		return 'Select who received the request.';
	}

	if (values.contactMode === 'existing' || options.disableNewContact) {
		if (values.contactId === null) {
			return 'Select the contact for this request.';
		}
	} else if (
		values.newContactName.trim().length === 0 &&
		values.newContactCompany.trim().length === 0 &&
		values.newContactPhone.trim().length === 0 &&
		values.newContactEmail.trim().length === 0
	) {
		return 'Enter at least one identifier for the new contact.';
	}

	if (!options.hideLocation) {
		if (values.addressMode === 'existing') {
			if (values.addressId === null) {
				return 'Select the address for this request.';
			}
		} else if (values.newAddressName.trim().length === 0) {
			return 'Enter a name for the new address.';
		}
	}

	return null;
}

// --- controls ---------------------------------------------------------------

function DateControl({
	label,
	value,
	onChange,
}: {
	readonly label: string;
	readonly value: string;
	readonly onChange: (value: string | null) => void;
}) {
	return (
		<div className="grid gap-1.5">
			<span className="font-medium text-foreground text-sm">{label}</span>
			<DatePicker
				ariaLabel={label}
				className="w-full"
				onChange={(date) => onChange(date === undefined ? null : formatLocalDate(date))}
				placeholder="Select date"
				value={parseLocalDate(value)}
			/>
		</div>
	);
}

function FormSection({
	title,
	children,
}: {
	readonly title: string;
	readonly children: React.ReactNode;
}) {
	return (
		<section className="grid gap-4">
			<h2 className="m-0 font-semibold text-foreground text-sm">{title}</h2>
			{children}
		</section>
	);
}

function MapPrompt({ children }: { readonly children: React.ReactNode }) {
	return (
		<div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center motion-safe:animate-in motion-safe:fade-in">
			<p className="m-0 inline-flex items-center gap-2 rounded-md border border-border/60 bg-card/95 px-3 py-2 text-foreground text-sm shadow-lg backdrop-blur-sm">
				{children}
			</p>
		</div>
	);
}

function useFlyTo(
	map: MapboxMap | null,
	coord: { readonly lat: number; readonly lng: number } | null,
): void {
	useEffect(() => {
		if (map === null || coord === null) {
			return;
		}
		map.flyTo({ center: [coord.lng, coord.lat], zoom: Math.max(map.getZoom(), 14), duration: 600 });
	}, [map, coord]);
}

function parseLocalDate(value: string): Date | undefined {
	if (value === '') {
		return undefined;
	}
	const [year, month, day] = value.slice(0, 10).split('-').map(Number);
	if (year === undefined || month === undefined || day === undefined) {
		return undefined;
	}
	const date = new Date(year, month - 1, day);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, '0');
	const day = `${date.getDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
}
