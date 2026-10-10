import { isOwnedGeometry } from '@simmer-mosquito/domain';
import { asMetadataValue } from '@simmer-mosquito/ui-web/components/form';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import {
	CollectionFormPage,
	CollectionFormSkeleton,
	type CollectionSaveInput,
} from '../../../components/adult-surveillance/collections/collection-form';
import {
	type CollectionFormValues,
	collectionFieldsFrom,
	noLureValue,
	noUnitValue,
} from '../../../components/adult-surveillance/collections/collection-form-values';
import { RecordEditFrame, RecordUnavailable } from '../../../components/record';
import { useAdditionalPersonnelMutations } from '../../../hooks/mutations/use-additional-personnel-mutations';
import { useCollectionMutations } from '../../../hooks/mutations/use-collection-mutations';
import { catalogs } from '../../../hooks/queries/catalog-register';
import type {
	CatalogListing,
	SchemaCatalogListing,
} from '../../../hooks/queries/catalog-roster-view';
import {
	type AdditionalPersonnelResult,
	useAdditionalPersonnel,
} from '../../../hooks/queries/use-additional-personnel';
import { useCatalogRoster } from '../../../hooks/queries/use-catalog-roster';
import {
	type CollectionRecord,
	useCollectionRecord,
} from '../../../hooks/queries/use-collection-record';
import { type ProfileListing, useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useTrapOptions } from '../../../hooks/queries/use-trap-options';
import { type UnitLabel, useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { todayInTimeZone } from '../../../lib/local-date';
import { recordNoun } from '../../../lib/record-nouns';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';

export const Route = createFileRoute('/adult-surveillance/collections/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowWriteFloor(context, '/adult-surveillance/collections/$id/edit')) {
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
	const methods = useCatalogRoster(catalogs.collectionMethods);
	const lures = useCatalogRoster(catalogs.collectionLures);
	const profiles = useProfileRoster();
	const { all: units } = useUnitLabels();
	const { id } = Route.useParams();
	const { collection, isReady, isError } = useCollectionRecord(id);

	return (
		<RecordEditFrame
			recordType="collection"
			reading={{ isError, isReady, record: collection }}
			skeleton={<CollectionFormSkeleton />}
		>
			{(record) => (
				<EditCollectionLoader
					collection={record}
					collectionLures={lures}
					collectionMethods={methods}
					profiles={profiles}
					units={units}
				/>
			)}
		</RecordEditFrame>
	);
}

function EditCollectionLoader({
	collection,
	collectionMethods,
	collectionLures,
	profiles,
	units,
}: {
	readonly collection: CollectionRecord;
	readonly collectionMethods: readonly SchemaCatalogListing[];
	readonly collectionLures: readonly CatalogListing[];
	readonly profiles: readonly ProfileListing[];
	readonly units: readonly UnitLabel[];
}) {
	const navigate = useNavigate();
	const timeZone = useOrganizationTimeZone();
	const mutations = useCollectionMutations();
	// Read here rather than beside the record, so the wait below covers it: the
	// form reads the trap it opens on once, for the map's reference point (#1436).
	const { traps, isReady: trapsReady } = useTrapOptions();
	// The crew lives in its own table; the form edits it as a list and the save
	// reconciles that against who is attached now.
	const personnel = useAdditionalPersonnel({ type: 'collection', id: collection.id });
	const { setPersonnel } = useAdditionalPersonnelMutations();

	const onSave = async ({ values, geometry, geometryChanged }: CollectionSaveInput) => {
		// A location edit only means anything on an ad hoc collection: a trap one
		// inherits its trap's point and address, and moving it means moving the
		// trap.
		const isAdhoc = collection.trapId === null;
		// The narrowed shape, not a boolean. The save reads its coordinates, and a
		// boolean left the route asking the same question twice to get the
		// compiler there.
		const refinedPoint =
			isAdhoc && geometryChanged && geometry !== null && isOwnedGeometry('collection', geometry)
				? geometry
				: null;

		await mutations.save({
			collectionId: collection.id,
			fields: collectionFieldsFrom(values, timeZone),
			current: collectionFieldsFrom(formValuesFrom(collection, personnel, timeZone), timeZone),
			geometry:
				refinedPoint === null
					? null
					: {
							geometry: refinedPoint,
							centroid: {
								lat: refinedPoint.coordinates[1],
								lng: refinedPoint.coordinates[0],
								geomType: 'point',
							},
						},
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
	};

	if (personnel.isError) {
		return (
			<RecordUnavailable
				description="This collection's personnel could not be loaded."
				layout="centered"
				recordType="collection"
				reason="error"
			/>
		);
	}
	if (!personnel.isReady || !trapsReady) {
		return <CollectionFormSkeleton />;
	}

	return (
		<CollectionFormPage
			canSubmit={mutations.canWrite}
			mode="edit"
			collectionLures={collectionLures}
			collectionMethods={collectionMethods}
			defaultValues={formValuesFrom(collection, personnel, timeZone)}
			header={{
				title: `Edit ${recordNoun('collection').title}`,
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
			profiles={profiles}
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
 * A stored instant back as the `YYYY-MM-DD` a date field holds, on the
 * organization's clock.
 *
 * The zone is the point. `collectionEffectiveDate` reads these same columns in
 * the organization's zone everywhere else, so taking the UTC prefix here —
 * which is what the route this replaces did — showed a trap emptied at 10:30pm
 * under the next day in its own edit form while its detail page showed the day
 * the crew worked. Two halves of one record disagreeing, and a save then wrote
 * the form's answer back.
 */
function operationalDay(value: Date | null, timeZone: string): string | null {
	return value === null ? null : todayInTimeZone(timeZone, value);
}
