/**
 * How a Habitat names itself in a list of Habitats.
 *
 * `habitat_name` is optional, so a Habitat with none is named by the head of
 * its id. The Habitats Map's rail and the Habitats Table both read rows from
 * `/map/habitats`, which is why the parameter is the two fields they share.
 */
export function habitatName(habitat: {
	readonly id: string;
	readonly habitatName: string | null;
}): string {
	return habitat.habitatName?.trim() || `Habitat ${habitat.id.slice(0, 8)}`;
}

/** A Habitat's type, as the rail and the table name it. */
export function habitatTypeName(
	habitatTypeId: string | null,
	typeNameById: ReadonlyMap<string, string>,
): string {
	if (habitatTypeId === null) {
		return 'Unassigned type';
	}
	return typeNameById.get(habitatTypeId) ?? 'Unknown type';
}
