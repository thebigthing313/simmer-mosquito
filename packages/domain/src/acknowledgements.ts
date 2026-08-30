/**
 * Every acknowledgement a command payload carries, as one union of names.
 *
 * An acknowledgement is the answer to "this removes, clears, rewrites or
 * overrides something you may not have meant" — a flag the client sets so the
 * server knows the question was put to somebody. The command vocabulary next
 * door names the writes; this names the confirmations those writes ride on.
 *
 * ## Why it is a list rather than a shape
 *
 * The flags are declared one at a time, on the payload of the command that needs
 * one, which is right: a flag belongs beside the consequence it guards. What
 * that shape cannot say is how many there are, or whether anything reads them.
 * #165 counted sixty-eight and found none of them checked. The real number is
 * seventy-three, and the five it missed were the ones that already worked.
 *
 * So this list is the denominator. `ACKNOWLEDGEMENT_MECHANISMS` in `apps/server`
 * is a total map over it naming, for each flag, what checks it, and
 * `pnpm check:acknowledgements` holds the two together and ratchets the count of
 * the ones nothing checks. A flag added to a payload without an entry fails the
 * gate, which is the point: the decision cannot be skipped, only recorded.
 *
 * Type-only would not do. The gate reads these names at runtime and the map's
 * totality test iterates them, so they are values.
 */
export const ACKNOWLEDGEMENTS = [
	'acknowledgedActionDetach',
	'acknowledgedActiveSubscriptionImpact',
	'acknowledgedActualActionContextChange',
	'acknowledgedActualActionDetach',
	'acknowledgedAssignmentItemDeletion',
	'acknowledgedAssociatedRecordsDeletion',
	'acknowledgedBatchClearance',
	'acknowledgedBatchDeletion',
	'acknowledgedCascadeDelete',
	'acknowledgedClosedRequestChange',
	'acknowledgedClosedRequestDeletion',
	'acknowledgedCompletedItemAdditionalAction',
	'acknowledgedCompletedItemAdditionalRecord',
	'acknowledgedCompletedMissionDeletion',
	'acknowledgedComponentDeletion',
	'acknowledgedContactMerge',
	'acknowledgedCrossDomainDetach',
	'acknowledgedDeactivateEmptyFormulation',
	'acknowledgedDependentDeactivation',
	'acknowledgedDuplicateRequestedActionMissioning',
	'acknowledgedDuplicateTrapCode',
	'acknowledgedEarlyStart',
	'acknowledgedFutureOnlyChange',
	'acknowledgedHabitatConfigurationSemanticsChange',
	'acknowledgedHabitatDelete',
	'acknowledgedHabitatLocationSemanticsChange',
	'acknowledgedHistoricalBatchLabelChange',
	'acknowledgedHistoricalContactChange',
	'acknowledgedHistoricalEquipmentLabelChange',
	'acknowledgedHistoricalLabelChange',
	'acknowledgedHistoricalLocationChange',
	'acknowledgedHistoricalProductChange',
	'acknowledgedHistoricalStationIdentityChange',
	'acknowledgedHistoricalVehicleLabelChange',
	'acknowledgedInProgressAssignmentChange',
	'acknowledgedInProgressMissionChange',
	'acknowledgedInspectionDetach',
	'acknowledgedItemProgressDeletion',
	'acknowledgedMergeConsolidatesHistory',
	'acknowledgedMethodMismatch',
	'acknowledgedMissionDetach',
	'acknowledgedMissionGeometryNotCovered',
	'acknowledgedMissionItemDeletion',
	'acknowledgedNotificationDeletion',
	'acknowledgedNotificationGeometryChange',
	'acknowledgedNotificationPlanChange',
	'acknowledgedNotificationRegenerationImpact',
	'acknowledgedNotificationTimingChange',
	'acknowledgedPartialImport',
	'acknowledgedPartialWorkCancellation',
	'acknowledgedPendingTrapCollection',
	'acknowledgedProgressedItemLinkChange',
	'acknowledgedProgressedItemReorder',
	'acknowledgedProgressedMissionCancellation',
	'acknowledgedRegionBoundaryChange',
	'acknowledgedRegionDelete',
	'acknowledgedRegionDetach',
	'acknowledgedRequestedActionMismatch',
	'acknowledgedRouteItemDeletion',
	'acknowledgedRouteRemoval',
	'acknowledgedSpeciesCountDeletion',
	'acknowledgedSpeciesCountsClearance',
	'acknowledgedSummaryDeletion',
	'acknowledgedSupportRecordDeletion',
	'acknowledgedTargetMismatch',
	'acknowledgedTaxonomyLabelChange',
	'acknowledgedTaxonomyMeaningChange',
	'acknowledgedTrapLocationSemanticsChange',
	'acknowledgedTrapMethodSemanticsChange',
	'acknowledgedUnitCodeChange',
	'acknowledgedUpdates',
	'acknowledgedWorkedMissionPlanChange',
	'acknowledgedWorkedMissionScheduleChange',
] as const;

/** The name of any acknowledgement in the vocabulary. */
export type Acknowledgement = (typeof ACKNOWLEDGEMENTS)[number];
