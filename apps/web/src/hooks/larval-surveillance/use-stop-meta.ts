import type { RouteStopView } from '../../routes/larval-surveillance/habitats/-route-data';
import { useEntityTags } from '../explorer/use-entity-tags';
import type { Tag } from '../queries/tag-view';
import { useHabitatTypeRoster } from '../queries/use-habitat-type-roster';
/**
 * The habitat type names and tags for a set of route stops. Type names come
 * from the eager `habitat_types` collection; tags from `useEntityTags` over the
 * habitats on screen.
 */
export function useStopMeta(stops: readonly RouteStopView[]): {
	readonly typeNameById: ReadonlyMap<string, string>;
	readonly tagsByHabitatId: ReadonlyMap<string, readonly Tag[]>;
} {
	const habitatTypes = useHabitatTypeRoster();

	const typeNameById = new Map(habitatTypes.map((type) => [type.id, type.name]));

	const habitatIds = [...new Set(stops.map((stop) => stop.habitatId))];

	// Scoped to the habitats on screen, and grouped for us — see `useEntityTags`.
	const { byId: tagsByHabitatId } = useEntityTags('habitat', habitatIds);

	return { typeNameById, tagsByHabitatId };
}
