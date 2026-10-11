import type { RouteStopView } from '../../components/larval-surveillance/habitats/route-data';
import { useEntityTags } from '../explorer/use-entity-tags';
import { catalogs } from '../queries/catalog-register';
import type { Tag } from '../queries/tag-view';
import { useCatalogRoster } from '../queries/use-catalog-roster';
/**
 * The habitat type names and tags for a set of route stops. Type names come
 * from the eager `habitat_types` collection; tags from `useEntityTags` over the
 * habitats on screen.
 */
export function useStopMeta(stops: readonly RouteStopView[]): {
	readonly typeNameById: ReadonlyMap<string, string>;
	readonly tagsByHabitatId: ReadonlyMap<string, readonly Tag[]>;
} {
	const habitatTypes = useCatalogRoster(catalogs.habitatTypes);

	const typeNameById = new Map(habitatTypes.map((type) => [type.id, type.name]));

	const habitatIds = [...new Set(stops.map((stop) => stop.habitatId))];

	// Scoped to the habitats on screen, and grouped for us — see `useEntityTags`.
	const { byId: tagsByHabitatId } = useEntityTags('habitat', habitatIds);

	return { typeNameById, tagsByHabitatId };
}
