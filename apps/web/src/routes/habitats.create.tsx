import type { HabitatRow, HabitatTypeRow, OrganizationRow } from '@simmer-mosquito/sync';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Separator } from '@simmer-mosquito/ui-web/components/ui/separator';
import { ArrowLeftIcon, MapPinnedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useAppForm } from '../forms';
import type { MetadataValue } from '../forms/field-components/metadata-field';
import { useCollectionRows } from '../sync/useCollectionRows';
import { webCollections } from '../sync/webCollections';
import {
	AddressIdInput,
	HabitatGeometryInput,
	type HabitatGeometryValue,
} from './-habitat-location-fields';
import { useHabitatsLayoutContext } from './habitats';

const noHabitatTypeValue = 'none';

interface HabitatCreateFormValues {
	readonly habitatName: string;
	readonly addressId: string | null;
	readonly habitatTypeId: string;
	readonly description: string;
	readonly geometry: HabitatGeometryValue | null;
	readonly metadata: MetadataValue;
}

export const Route = createFileRoute('/habitats/create')({
	component: CreateHabitatRoute,
});

function CreateHabitatRoute() {
	const { auth } = Route.useRouteContext();
	const { requestMapPoint } = useHabitatsLayoutContext();
	const navigate = useNavigate();
	const { rows: organizations, status: organizationStatus } = useCollectionRows(
		webCollections.currentOrganization,
	);
	const { rows: habitatTypes } = useCollectionRows(webCollections.habitatTypes);
	const organization = organizations[0] ?? null;
	const activeHabitatTypes = habitatTypes.filter((habitatType) => habitatType.isActive);
	const [saveError, setSaveError] = useState<string | null>(null);
	const form = useAppForm({
		defaultValues: defaultHabitatValues(),
		validators: {
			onSubmit: () =>
				organization === null ? 'Organization details are still loading.' : undefined,
		},
		onSubmit: async ({ value }) => {
			setSaveError(null);
			try {
				const transaction = createHabitatFromValues({
					auth: auth.snapshot,
					organization,
					values: value,
				});
				await transaction.isPersisted.promise;
				await navigate({ to: '/habitats' });
			} catch (error) {
				setSaveError(errorMessageForSave(error));
			}
		},
	});
	const canSubmit = organization !== null && auth.snapshot?.authenticated === true;

	return (
		<>
			<CardHeader className="px-4 py-4">
				<div className="grid gap-1">
					<CardTitle>Create habitat</CardTitle>
					<CardDescription>
						Add a mapped larval habitat with the core field details crews need.
					</CardDescription>
				</div>
				<CardAction>
					<Button asChild variant="outline" size="sm">
						<Link to="/habitats">
							<ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
							Habitats
						</Link>
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent
				padding="compact"
				className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-5"
			>
				<div className="grid gap-2 rounded-md border border-border/40 bg-muted/30 p-3 text-sm text-muted-foreground">
					<div className="flex items-start gap-2">
						<MapPinnedIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
						<p className="m-0">
							Draw geometry from the map or link an address book record while the spatial context
							stays visible.
						</p>
					</div>
				</div>
				<form.AppForm>
					<form
						className="grid gap-4"
						onSubmit={(event) => {
							event.preventDefault();
							void form.handleSubmit();
						}}
					>
						<form.FormErrorAlert title="Unable to create habitat" />
						{saveError === null ? null : (
							<Alert variant="destructive">
								<AlertTitle>Unable to create habitat</AlertTitle>
								<AlertDescription>{saveError}</AlertDescription>
							</Alert>
						)}

						<div className="grid gap-4 md:grid-cols-2">
							<form.AppField name="habitatName">
								{(field) => (
									<field.TextField label="Habitat name" placeholder="e.g. North basin catchment" />
								)}
							</form.AppField>
							<form.AppField name="habitatTypeId">
								{(field) => (
									<field.SelectField
										label="Habitat type"
										options={habitatTypeOptions(activeHabitatTypes)}
										placeholder="Select a type"
									/>
								)}
							</form.AppField>
						</div>

						<form.AppField name="addressId">
							{(field) => (
								<AddressIdInput
									actorProfileId={
										auth.snapshot?.authenticated === true
											? auth.snapshot.localIdentity.profileId
											: null
									}
									organizationId={organization?.id ?? ''}
									requestMapPoint={requestMapPoint}
									value={field.state.value}
									onValueChange={field.handleChange}
								/>
							)}
						</form.AppField>

						<form.AppField
							name="description"
							validators={{
								onSubmit: ({ value }) =>
									value.trim().length === 0 ? 'Description is required.' : undefined,
							}}
						>
							{(field) => (
								<field.TextareaField
									label="Description"
									placeholder="Describe access notes, habitat condition, and useful field context."
									rows={4}
								/>
							)}
						</form.AppField>

						<form.AppField
							name="geometry"
							validators={{
								onSubmit: ({ value }) => (value === null ? 'Geometry is required.' : undefined),
							}}
						>
							{(field) => (
								<HabitatGeometryInput
									requestMapPoint={requestMapPoint}
									value={field.state.value}
									onValueChange={field.handleChange}
								/>
							)}
						</form.AppField>

						<form.AppField name="metadata">
							{(field) => (
								<field.MetadataField
									label="Metadata"
									description="Optional structured notes for agency-specific habitat details."
									mode={{ kind: 'manual' }}
								/>
							)}
						</form.AppField>

						{organizationStatus === 'loading' ? (
							<Empty className="border border-border/40 bg-muted/30">
								<EmptyHeader>
									<EmptyTitle>Loading organization</EmptyTitle>
									<EmptyDescription>Habitat creation unlocks once sync is ready.</EmptyDescription>
								</EmptyHeader>
							</Empty>
						) : null}

						<Separator />
						<form.FormActions>
							<form.ResetButton />
							<form.SubmitButton disabled={!canSubmit}>Create habitat</form.SubmitButton>
						</form.FormActions>
					</form>
				</form.AppForm>
			</CardContent>
		</>
	);
}

function defaultHabitatValues(): HabitatCreateFormValues {
	return {
		addressId: null,
		habitatName: '',
		habitatTypeId: noHabitatTypeValue,
		description: '',
		geometry: null,
		metadata: null,
	};
}

function habitatTypeOptions(habitatTypes: readonly HabitatTypeRow[]) {
	return [
		{ label: 'Unassigned type', value: noHabitatTypeValue },
		...habitatTypes.map((habitatType) => ({
			label: habitatType.name,
			value: habitatType.id,
		})),
	];
}

function createHabitatFromValues({
	auth,
	organization,
	values,
}: {
	readonly auth: ReturnType<typeof Route.useRouteContext>['auth']['snapshot'];
	readonly organization: OrganizationRow | null;
	readonly values: HabitatCreateFormValues;
}) {
	if (organization === null) {
		throw new Error('Organization details are still loading.');
	}
	if (auth?.authenticated !== true || auth.localIdentity.profileId === null) {
		throw new Error('Your profile is still loading.');
	}

	if (values.geometry === null) {
		throw new Error('Geometry is required.');
	}

	const now = new Date().toISOString();
	const row: HabitatRow = {
		id: crypto.randomUUID(),
		organizationId: organization.id,
		addressId: values.addressId,
		habitatTypeId:
			values.habitatTypeId === noHabitatTypeValue ? null : requiredText(values.habitatTypeId),
		habitatName: nullableText(values.habitatName),
		description: requiredText(values.description),
		isActive: true,
		isInaccessible: false,
		metadata: values.metadata,
		createdByProfileId: auth.localIdentity.profileId,
		updatedByProfileId: auth.localIdentity.profileId,
		createdAt: now,
		updatedAt: now,
	};

	return webCollections.habitats.insert(row, {
		metadata: {
			locationSource: {
				kind: 'geometry',
				geometry: values.geometry,
			},
		},
	});
}

function requiredText(value: string): string {
	const text = value.trim();
	if (text.length === 0) {
		throw new Error('Required text is missing.');
	}
	return text;
}

function nullableText(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}

function errorMessageForSave(error: unknown): string {
	return error instanceof Error ? error.message : 'Unable to save habitat.';
}
