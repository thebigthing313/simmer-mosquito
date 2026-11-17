import type { TreatmentDetail } from '../../../hooks/queries/control-action-view';
import { useHabitatLocationContext } from '../../../hooks/use-habitat-location-context';
import { CHEMICAL_GEOMETRY_SOURCE, useOwnedGeometry } from '../../../hooks/use-owned-geometry';
import { RecordLocationCard } from '../../map/record-location-card';

/**
 * Where the Treatment went, drawn as its full shape rather than its centroid,
 * with the treated habitat underneath. Takes the Treatment and the habitat's
 * name, `null` when it names none.
 */
export function TreatmentLocationCard({
	treatment,
	habitatName,
}: {
	readonly treatment: TreatmentDetail;
	readonly habitatName: string | null;
}) {
	// Electric streams only the centroid (ADR 0009), so the shape is fetched here.
	const geometry = useOwnedGeometry(
		CHEMICAL_GEOMETRY_SOURCE,
		treatment.id,
		treatment.updatedAt.toISOString(),
	);
	const habitatContext = useHabitatLocationContext(treatment.habitatId, habitatName);

	return (
		<RecordLocationCard
			context={habitatContext}
			emptyDescription="This treatment has no location to display."
			geojson={geometry.geojson}
			geomType={geometry.geomType ?? treatment.geometryKind}
			isError={geometry.isError}
			isPending={geometry.isPending}
			unsupportedShape={geometry.unsupportedShape}
		/>
	);
}
