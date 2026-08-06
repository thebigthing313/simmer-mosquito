import type { ResolvedLarvalInspectionEntryPolicy } from '@simmer-mosquito/domain';
import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type {
	AdditionalPersonnelRow,
	CommentRow,
	HabitatTypeRow,
	InspectionRow,
	LarvalDensity,
	ProfileRow,
	SampleRow,
} from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { getServerUrl } from '../../../auth';
import {
	saveAdditionalPersonnel,
	useAdditionalPersonnel,
} from '../../../components/additional-personnel';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { attachLinksBestEffort } from '../../../lib/attach-links';
import { isWriteBlocked } from '../../../lib/write-access';
import { webCollections } from '../../../sync/webCollections';
import {
	type DrawGeometry,
	defaultInspectionFormValues,
	InspectionFormPage,
	type InspectionFormValues,
	type InspectionSampleDraft,
	noHabitatTypeValue,
	unsetDensityValue,
} from './-inspection-form';

export const Route = createFileRoute('/larval-surveillance/inspections/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/larval-surveillance/inspections/$id',
			});
		}
	},
	component: EditInspectionRoute,
});

const inspectionGcTimeMs = 30_000;

function EditInspectionRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const { organization, settings } = useOrganizationWorkspace(auth.snapshot);
	const { rows: habitatTypes } = useCollectionRows<HabitatTypeRow>(webCollections.habitatTypes);
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);

	// inspections is an on-demand collection, so this reads live status through
	// useLiveQuery (not the suspense variant, which can hang after a nav unmount).
	const result = useLiveQuery(
		{
			gcTime: inspectionGcTimeMs,
			query: (query) =>
				query
					.from({ inspection: webCollections.inspections })
					.where(({ inspection }) => eq(inspection.id, id))
					.findOne(),
		},
		[id],
	);
	const inspection = result.data as InspectionRow | undefined;

	// Mounted here rather than inside the loader so the crew subset — and the
	// samples subset below — are already streaming when the save fires; a write
	// over a cold on-demand stream never sees its txid come back.
	const personnel = useAdditionalPersonnel({ type: 'inspection', id });
	useLiveQuery(
		{
			gcTime: inspectionGcTimeMs,
			query: (query) =>
				query
					.from({ sample: webCollections.samples })
					.where(({ sample }) => eq(sample.inspectionId, id)),
		},
		[id],
	);

	if (result.isError) {
		return <EditUnavailable description="This inspection could not be loaded." />;
	}
	if (!result.isReady || !personnel.isReady) {
		return <EditFormSkeleton />;
	}
	if (inspection === undefined) {
		return (
			<EditUnavailable description="This inspection could not be found, or you do not have access to it." />
		);
	}

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	return (
		<EditInspectionLoader
			actorProfileId={actorProfileId}
			canSubmit={organization !== null && actorProfileId !== null}
			existingPersonnel={personnel.rows}
			habitatTypes={habitatTypes}
			inspection={inspection}
			organizationId={organization?.id ?? ''}
			personnelProfileIds={personnel.profileIds}
			policy={settings.larvalSurveillance.inspectionEntryPolicy}
			profiles={profiles}
		/>
	);
}

function EditInspectionLoader({
	inspection,
	habitatTypes,
	profiles,
	policy,
	organizationId,
	actorProfileId,
	canSubmit,
	existingPersonnel,
	personnelProfileIds,
}: {
	readonly inspection: InspectionRow;
	readonly habitatTypes: readonly HabitatTypeRow[];
	readonly profiles: readonly ProfileRow[];
	readonly policy: ResolvedLarvalInspectionEntryPolicy;
	readonly organizationId: string;
	readonly actorProfileId: string | null;
	readonly canSubmit: boolean;
	readonly existingPersonnel: readonly AdditionalPersonnelRow[];
	readonly personnelProfileIds: readonly string[];
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const isAdhoc = inspection.habitatId === null;

	// Geometry is not part of the Electric shape (ADR 0009), so it comes from the
	// display endpoint. Keyed on updatedAt so reopening after a save loads the
	// current shape, and holding the previous value across that key change so the
	// form is not unmounted mid-save — which would take any error with it.
	const geometryQuery = useQuery({
		queryKey: ['inspection-geometry', inspection.id, inspection.updatedAt],
		queryFn: ({ signal }) => fetchInspectionGeometry(inspection.id, signal),
		placeholderData: (previous) => previous,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const geojson = geometryQuery.data ?? null;
	const initialAdhocGeometry = isAdhoc ? toDrawGeometry(geojson) : null;

	const onSave = useCallback(
		async ({
			values,
			adhocGeometry,
		}: {
			readonly values: InspectionFormValues;
			readonly adhocGeometry: DrawGeometry | null;
		}) => {
			if (actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}

			const now = new Date().toISOString();
			const wet = values.isWet;
			const nextDensity =
				wet && values.density !== unsetDensityValue ? (values.density as LarvalDensity) : null;
			const nextTypeId =
				isAdhoc && values.habitatTypeId !== noHabitatTypeValue ? values.habitatTypeId : null;
			const nextAddressId = isAdhoc ? values.addressId : inspection.addressId;
			// Only an ad-hoc inspection owns its geometry; a habitat one inherits the
			// habitat's, which this form cannot move it off.
			const geometryChanged =
				isAdhoc && JSON.stringify(adhocGeometry) !== JSON.stringify(initialAdhocGeometry);

			const detailsChanged =
				values.inspectionDate !== inspection.inspectionDate ||
				values.inspectedByProfileId !== inspection.inspectedByProfileId ||
				wet !== inspection.isWet ||
				(wet ? values.dipCount : null) !== inspection.dipCount ||
				nextDensity !== inspection.density ||
				(wet ? values.larvaeCount : null) !== inspection.larvaeCount ||
				(wet && values.lifeStages.hasEggs) !== inspection.hasEggs ||
				(wet && values.lifeStages.hasFirstInstar) !== inspection.hasFirstInstar ||
				(wet && values.lifeStages.hasSecondInstar) !== inspection.hasSecondInstar ||
				(wet && values.lifeStages.hasThirdInstar) !== inspection.hasThirdInstar ||
				(wet && values.lifeStages.hasFourthInstar) !== inspection.hasFourthInstar ||
				(wet && values.lifeStages.hasPupae) !== inspection.hasPupae ||
				nextTypeId !== inspection.habitatTypeId ||
				nextAddressId !== inspection.addressId;

			if (detailsChanged || geometryChanged) {
				// Inlined so TanStack DB infers the mutable draft type; a standalone
				// `(draft: InspectionRow)` annotation would re-impose the readonly props.
				const applyEdits = (draft: InspectionRow) => {
					const writable = draft as { -readonly [K in keyof InspectionRow]: InspectionRow[K] };
					writable.inspectionDate = values.inspectionDate;
					writable.inspectedByProfileId = values.inspectedByProfileId;
					writable.isWet = wet;
					writable.dipCount = wet ? values.dipCount : null;
					writable.density = nextDensity;
					writable.larvaeCount = wet ? values.larvaeCount : null;
					writable.hasEggs = wet && values.lifeStages.hasEggs;
					writable.hasFirstInstar = wet && values.lifeStages.hasFirstInstar;
					writable.hasSecondInstar = wet && values.lifeStages.hasSecondInstar;
					writable.hasThirdInstar = wet && values.lifeStages.hasThirdInstar;
					writable.hasFourthInstar = wet && values.lifeStages.hasFourthInstar;
					writable.hasPupae = wet && values.lifeStages.hasPupae;
					if (isAdhoc) {
						writable.habitatTypeId = nextTypeId;
						writable.addressId = values.addressId;
					}
					writable.updatedByProfileId = actorProfileId;
					writable.updatedAt = now;
				};

				const transaction =
					geometryChanged && adhocGeometry !== null
						? webCollections.inspections.update(
								inspection.id,
								{ metadata: { locationSource: { kind: 'geometry', geometry: adhocGeometry } } },
								applyEdits,
							)
						: webCollections.inspections.update(inspection.id, applyEdits);
				await settleWrite(transaction);
			}

			// The rest reference the inspection and cannot fail a save that already
			// landed, so each is reported rather than thrown (see attachLinksBestEffort).
			await attachLinksBestEffort('the additional personnel', () =>
				saveAdditionalPersonnel({
					target: { type: 'inspection', id: inspection.id },
					organizationId,
					actorProfileId,
					existing: existingPersonnel,
					profileIds: values.additionalPersonnelIds,
				}),
			);

			if (values.samples.length > 0) {
				await attachLinksBestEffort('the samples', () =>
					saveInspectionSamples(values.samples, {
						inspectionId: inspection.id,
						organizationId,
						actorProfileId,
						now,
					}),
				);
			}

			const comment = values.comment.trim();
			if (comment.length > 0) {
				await attachLinksBestEffort('the note', () =>
					addInspectionComment(comment, {
						inspectionId: inspection.id,
						organizationId,
						actorProfileId,
						now,
					}),
				);
			}

			// The detail page reads the inspection over HTTP, so its cached copy would
			// still hold the pre-edit values on arrival.
			await queryClient.invalidateQueries({ queryKey: ['inspection-detail', inspection.id] });
			await navigate({ to: '/larval-surveillance/inspections/$id', params: { id: inspection.id } });
		},
		[
			inspection,
			isAdhoc,
			initialAdhocGeometry,
			actorProfileId,
			organizationId,
			existingPersonnel,
			navigate,
			queryClient,
		],
	);

	if (geometryQuery.isError) {
		return <EditUnavailable description="This inspection's location could not be loaded." />;
	}
	if (geometryQuery.isPending) {
		return <EditFormSkeleton />;
	}

	return (
		<InspectionFormPage
			canSubmit={canSubmit}
			defaultValues={defaultsFromInspection(inspection, personnelProfileIds)}
			habitatTypes={habitatTypes}
			header={{
				title: 'Edit Inspection',
				description: 'Revise what this inspection found, or who recorded it.',
				backTo: '/larval-surveillance/inspections/$id',
				backParams: { id: inspection.id },
				backLabel: 'Back to inspection',
			}}
			initialAdhocGeometry={initialAdhocGeometry}
			initialPreviewGeometry={geojson}
			mode="edit"
			onSave={onSave}
			organizationId={organizationId}
			policy={policy}
			profiles={profiles}
			submitLabel="Save changes"
		/>
	);
}

function defaultsFromInspection(
	inspection: InspectionRow,
	personnelProfileIds: readonly string[],
): InspectionFormValues {
	return {
		...defaultInspectionFormValues(
			inspection.inspectionDate,
			inspection.inspectedByProfileId ?? null,
		),
		locationMode: inspection.habitatId === null ? 'adhoc' : 'habitat',
		habitatId: inspection.habitatId,
		habitatTypeId: inspection.habitatTypeId ?? noHabitatTypeValue,
		addressId: inspection.addressId,
		additionalPersonnelIds: [...personnelProfileIds],
		isWet: inspection.isWet,
		density: inspection.density ?? unsetDensityValue,
		dipCount: inspection.dipCount,
		larvaeCount: inspection.larvaeCount,
		lifeStages: {
			hasEggs: inspection.hasEggs,
			hasFirstInstar: inspection.hasFirstInstar,
			hasSecondInstar: inspection.hasSecondInstar,
			hasThirdInstar: inspection.hasThirdInstar,
			hasFourthInstar: inspection.hasFourthInstar,
			hasPupae: inspection.hasPupae,
		},
	};
}

/** Samples added on this pass. Existing ones are managed from the record. */
async function saveInspectionSamples(
	samples: readonly InspectionSampleDraft[],
	context: {
		readonly inspectionId: string;
		readonly organizationId: string;
		readonly actorProfileId: string;
		readonly now: string;
	},
): Promise<void> {
	for (const sample of samples) {
		const row: SampleRow = {
			id: sample.id,
			organizationId: context.organizationId,
			inspectionId: context.inspectionId,
			displayName: sample.label.trim() === '' ? null : sample.label.trim(),
			isZeroLarvae: false,
			hasNonMosquito: false,
			unidentifiableReason: null,
			createdByProfileId: context.actorProfileId,
			updatedByProfileId: context.actorProfileId,
			createdAt: context.now,
			updatedAt: context.now,
		};
		await settleWrite(webCollections.samples.insert(row));
	}
}

async function addInspectionComment(
	commentText: string,
	context: {
		readonly inspectionId: string;
		readonly organizationId: string;
		readonly actorProfileId: string;
		readonly now: string;
	},
): Promise<void> {
	const comment: CommentRow = {
		id: crypto.randomUUID(),
		organizationId: context.organizationId,
		entityType: 'inspection',
		entityId: context.inspectionId,
		commentText,
		commentedByProfileId: context.actorProfileId,
		commentedAt: context.now,
		isPinned: false,
		createdByProfileId: context.actorProfileId,
		updatedByProfileId: context.actorProfileId,
		createdAt: context.now,
		updatedAt: context.now,
	};
	await settleWrite(webCollections.comments.insert(comment));
}

async function fetchInspectionGeometry(
	inspectionId: string,
	signal: AbortSignal,
): Promise<GeoJsonGeometry | null> {
	const url = new URL(`/map/inspections/${inspectionId}`, getServerUrl());
	const response = await fetch(url, { credentials: 'include', signal });
	if (response.status === 404) {
		return null;
	}
	if (!response.ok) {
		throw new Error(`Inspection geometry request failed with ${response.status}`);
	}

	const body = (await response.json()) as {
		readonly inspection?: { readonly geojson?: unknown };
	};
	return (body.inspection?.geojson ?? null) as GeoJsonGeometry | null;
}

// The draw flow owns single Point/LineString/Polygon geometries. Anything else
// (a legacy multi-geometry) cannot be re-drawn vertex-by-vertex here, so it seeds
// as "no geometry" — the findings are still editable and a redraw replaces it.
function toDrawGeometry(geojson: unknown): DrawGeometry | null {
	if (geojson === null || typeof geojson !== 'object') {
		return null;
	}
	const candidate = geojson as { readonly type?: unknown; readonly coordinates?: unknown };
	if (!Array.isArray(candidate.coordinates) || candidate.coordinates.length === 0) {
		return null;
	}
	if (
		candidate.type === 'Point' ||
		candidate.type === 'LineString' ||
		candidate.type === 'Polygon'
	) {
		return geojson as DrawGeometry;
	}
	return null;
}

function EditFormSkeleton() {
	return (
		<div className="grid h-full min-h-0 w-full grid-cols-[2fr_3fr] overflow-hidden">
			<div className="grid content-start gap-5 overflow-y-auto px-5 py-5">
				<Skeleton className="h-6 w-40" />
				<Skeleton className="h-9 w-full" />
				<Skeleton className="h-24 w-full" />
				<div className="grid grid-cols-2 gap-4">
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-9 w-full" />
				</div>
			</div>
			<Skeleton className="h-full w-full rounded-none border-border/40 border-l" />
		</div>
	);
}

function EditUnavailable({ description }: { readonly description: string }) {
	return (
		<div className="flex h-full min-h-0 items-center justify-center p-8">
			<Empty className="max-w-md border border-border/40 bg-muted/30">
				<EmptyHeader>
					<EmptyTitle>Inspection Unavailable</EmptyTitle>
					<EmptyDescription>{description}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
