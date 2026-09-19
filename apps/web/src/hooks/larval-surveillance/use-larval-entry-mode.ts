import type { LarvalInspectionEntryMode } from '@simmer-mosquito/domain';
import { useOrganizationSettings } from '../queries/use-organization-settings';

/** The organization's larval inspection entry mode. */
export function useLarvalEntryMode(): LarvalInspectionEntryMode {
	return useOrganizationSettings().larvalSurveillance.inspectionEntryPolicy.mode;
}
