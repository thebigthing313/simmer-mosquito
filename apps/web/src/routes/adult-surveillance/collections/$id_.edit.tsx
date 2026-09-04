import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { asMetadataValue } from '@simmer-mosquito/ui-web/components/form';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { EditFormSkeleton, RecordUnavailable } from '../../../components/record';
import { useAdditionalPersonnelMutations } from '../../../hooks/mutations/use-additional-personnel-mutations';
import { useCollectionMutations } from '../../../hooks/mutations/use-collection-mutations';
import {
	type AdditionalPersonnelResult,
	useAdditionalPersonnel,
} from '../../../hooks/queries/use-additional-personnel';
import {
	type CatalogListing,
	type SchemaCatalogListing,
	useCollectionLureRoster,
	useCollectionMethodRoster,
} from '../../../hooks/queries/use-catalog-rosters';
import {
	type CollectionRecord,
	useCollectionRecord,
} from '../../../hooks/queries/use-collection-record';
import { type ProfileListing, useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { type TrapOption, useTrapOptions } from '../../../hooks/queries/use-trap-options';
import { type UnitLabel, useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { todayInTimeZone } from '../../../lib/local-date';
import { isWriteBlocked } from '../../../lib/write-access';
import {
	CollectionFormPage,
	type CollectionFormValues,
	type CollectionSaveInput,
	collectionFieldsFrom,
	noLureValue,
	noUnitValue,
} from './-collection-form';

export const Route = createFileRoute('/adult-surveillance/collections/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/adult-surveillance/collections/$id',
			});
		}
	},
	component: EditCollectionRoute,
});

function EditCollectionRoute() {
	const { traps } = useTrapOptions();
	const methods = useCollectionMethodRoster();
	const lures = useCollectionLureRoster();
	const profiles = useProfileRoster();
	const { all: units } = useUnitLabels();
	const { id } = Route.useParams();
	const { collection, isReady, isError } = useCollectionRecord(id);

	if (isError) {
		return <RecordUnavailable layout="centered" noun="collection" reason="error" />;
	}
	if (!isReady) {
		return <EditFormSkeleton rows={['h-9', ['h-9', 'h-9'], 'h-24']} />;
	}
	if (collection === undefined) {
		return <RecordUnavailable layout="centered" noun="collection" reason="not-found" />;
	}

	return (
		<EditCollectionLoader
			collection={collection}
			collectionLures={lures}
			collectionMethods={methods}
			profiles={profiles}
			traps={traps}
			units={units}
		/>
	);
}

function EditCollectionLoader({
	collection,
	traps,
	collectionMethods,
	collectionLures,
	profiles,
	units,
}: {
	readonly collection: CollectionRecord;
	readonly traps: readonly TrapOption[];
	readonly collectionMethods: readonly SchemaCatalogListing[];
	readonly collectionLures: readonly CatalogListing[];
	readonly profiles: readonly ProfileListing[];
	readonly units: readonly UnitLabel[];
}) {
	const navigate = useNavigate();
	const timeZone = useOrganizationTimeZone();
	const mutations = useCollectionMutations();
	// The crew lives in its own table; the form edits it as a list and the save
	// reconciles that against who is attached now.
	const personnel = useAdditionalPersonnel({ type: 'collection', id: collection.id });
	const { setPersonnel } = useAdditionalPersonnelMutations();

	const onSave = useCallback(
		async ({ values, geometry, geometryChanged }: CollectionSaveInput) => {
			// A location edit only means anything on an ad hoc collection: a trap one
			// inherits its trap's point and address, and moving it means moving the
			// trap.
			const isAdhoc = collection.trapId === null;
			const refinedPoint =
				isAdhoc && geometryChanged && geometry !== null && geometry.type === 'Point';

			await mutations.save({
				collectionId: collection.id,
				fields: collectionFieldsFrom(values, timeZone),
				current: collectionFieldsFrom(formValuesFrom(collection, personnel, timeZone), timeZone),
				geometry:
					refinedPoint && geometry.type === 'Point'
						? {
								geometry: geometry as unknown as GeoJsonGeometry,
								centroid: {
									lat: geometry.coordinates[1],
									lng: geometry.coordinates[0],
									geomType: 'point',
								},
							}
						: null,
			});
			await setPersonnel({
				target: { type: 'collection', id: collection.id },
				existing: personnel.rows,
				profileIds: values.additionalPersonnelIds,
			});
			await navigate({
				to: '/adult-surveillance/collections/$id',
				params: { id: collection.id },
			});
		},
		[collection, personnel, navigate, timeZone, setPersonnel, mutations],
	);

	if (personnel.isError) {
		return (
			<RecordUnavailable
				description="This collection's personnel could not be loaded."
				layout="centered"
				noun="collection"
				reason="error"
			/>
		);
	}
	if (!personnel.isReady) {
		return <EditFormSkeleton rows={['h-9', ['h-9', 'h-9'], 'h-24']} />;
	}

	return (
		<CollectionFormPage
			canSubmit={mutations.canWrite}
			mode="edit"
			collectionLures={collectionLures}
			collectionMethods={collectionMethods}
			defaultValues={formValuesFrom(collection, personnel, timeZone)}
			header={{
				title: 'Edit Collection',
				description: 'Update this collection’s method, timing, personnel, location, or result.',
				backTo: '/adult-surveillance/collections/$id',
				backParams: { id: collection.id },
				backLabel: 'Back to collection',
			}}
			initialGeometry={
				collection.trapId === null
					? { type: 'Point', coordinates: [collection.longitude, collection.latitude] }
					: null
			}
			lockSourceMode
			onSave={onSave}
			organizationId={collection.organizationId}
			profiles={profiles}
			submitLabel="Save changes"
			traps={traps}
			units={units}
		/>
	);
}

/**
 * The form's values as this collection already stands.
 *
 * Used twice: to seed the form, and as the `current` a save compares against.
 * Going back through the form's own spelling rather than comparing columns
 * directly is what makes the comparison honest — the typed days are re-stamped
 * on the way out, so an untouched date has to be re-stamped the same way to
 * compare equal, and only this round trip guarantees that.
 */
function formValuesFrom(
	collection: CollectionRecord,
	personnel: AdditionalPersonnelResult,
	timeZone: string,
): CollectionFormValues {
	return {
		sourceMode: collection.trapId === null ? 'adhoc' : 'trap',
		trapId: collection.trapId,
		addressId: collection.addressId,
		collectionMethodId: collection.collectionMethodId,
		collectionLureId: collection.collectionLureId ?? noLureValue,
		timingMode: collection.collectionTimingMode,
		startedAt: operationalDay(collection.startedAt, timeZone),
		collectedAt: operationalDay(collection.collectedAt, timeZone),
		collectionDate: collection.collectionDate,
		durationAmount: collection.durationAmount,
		durationUnitId: collection.durationUnitId ?? noUnitValue,
		setByProfileId: collection.setByProfileId,
		collectedByProfileId: collection.collectedByProfileId,
		additionalPersonnelIds: personnel.profileIds,
		hasProblem: collection.hasProblem,
		metadata: asMetadataValue(collection.metadata),
		// Create-only field; the detail page's thread is where an edit adds a note.
		comment: '',
	};
}

/**
 * A stored instant back as the `YYYY-MM-DD` a date field holds, on the agency's
 * clock.
 *
 * The zone is the point. `collectionEffectiveDate` reads these same columns in
 * the agency's zone everywhere else, so taking the UTC prefix here — which is
 * what the route this replaces did — showed a trap emptied at 10:30pm under the
 * next day in its own edit form while its detail page showed the day the crew
 * worked. Two halves of one record disagreeing, and a save then wrote the form's
 * answer back.
 */
function operationalDay(value: Date | null, timeZone: string): string | null {
	return value === null ? null : todayInTimeZone(timeZone, value);
}
