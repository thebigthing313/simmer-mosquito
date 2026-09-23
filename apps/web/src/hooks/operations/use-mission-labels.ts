import { useControlMethodNames } from '../explorer/use-control-method-names';
import { usePersonnelOptions } from '../explorer/use-personnel-options';
import { missionDisplayName } from '../queries/operations-view';
import type { MissionRecord } from '../queries/use-mission';
import { useOrganizationTimeZone } from '../use-organization-time-zone';

export interface MissionLabels {
	readonly displayName: string | null;
	readonly assigneeName: string | null;
	readonly methodName: string | null;
}

/**
 * The three names the page reads off catalogs rather than off the mission row:
 * the display name, the assignee and the planned method.
 */
export function useMissionLabels(mission: MissionRecord | null): MissionLabels {
	const { nameById } = usePersonnelOptions();
	const methodNameById = useControlMethodNames();
	const timeZone = useOrganizationTimeZone();

	return {
		displayName: mission === null ? null : missionDisplayName(mission, timeZone),
		assigneeName: lookup(nameById, mission?.assignedToProfileId),
		methodName: lookup(methodNameById, mission?.plannedMethodId),
	};
}

/** A catalog name by id, tolerating both "no id" and "id that resolves to nothing". */
function lookup(names: ReadonlyMap<string, string>, id: string | null | undefined): string | null {
	return id == null ? null : (names.get(id) ?? null);
}
