/**
 * How a read joins and projects each performed control action.
 *
 * Not a hook, so not a `use-` file. A chemical application, a source
 * reduction, a biocontrol release and an outreach action each name a method
 * catalog (an application names its product as well), a unit (outreach has
 * none) and whoever performed it, each on a foreign key of its own. About ten
 * read hooks used to write those joins and the columns behind them out per
 * type (#1428). This module is the one place that knows them, and a hook
 * composes what it needs into its own query.
 *
 * A hook keeps what is its own: the `from`, the `where`, the ordering, the
 * `gcTime`, which joins it makes, and the field names of the view it returns.
 * What it takes from here is the column each of those reads.
 *
 * A joined name is projected as `coalesce(joined.name, null)`: the name when the
 * join matched and `null` otherwise, never the `undefined` an unmatched `left`
 * join yields and never a stand-in label. The id beside it tells "none recorded"
 * from "not in the client", and the surface draws its own words for each
 * (#874, #1501).
 *
 * ## No column map
 *
 * The rule `performed-action-writes.ts` states for the write side holds here
 * too. Every column is a property access on a typed ref inside a function,
 * never a column name in a string, so a misspelled column is a `tsc` error in
 * this file rather than a lookup that answers `undefined`. A config shaped like
 * `{ amountColumn: 'amount_released' }` is what this is written to avoid.
 *
 * Each type's date column is read from `ACTIVITY_DATES` rather than named again
 * here.
 *
 * ## The shapes
 *
 * Per type, a join predicate per lookup takes the action's ref and the joined
 * ref and returns the `eq`. `measured` returns the method, performer, amount
 * and unit columns under one set of field names, which the hook renames into
 * its own view. It is generic over the ref the way `addressSelect` is, so a
 * ref carrying a nullable brand passes it through to every field.
 */

import type {
	Application,
	ApplicationMethod,
	BiocontrolAction,
	BiocontrolMethod,
	Insecticide,
	OutreachAction,
	OutreachMethod,
	Profile,
	SourceReduction,
	SourceReductionMethod,
	Unit,
} from '@simmer-mosquito/sync';
import { eq, type IR } from '@tanstack/react-db';
import { ACTIVITY_DATES, type HasColumn } from './activity-dates';

/** What a join predicate hands back to `.join()`. */
type Predicate = IR.BasicExpression<boolean>;

export const PERFORMED_ACTIONS = {
	applications: {
		date: ACTIVITY_DATES.applications.column,
		joinProduct: (
			application: HasColumn<Application, 'insecticide_id'>,
			product: HasColumn<Insecticide, 'id'>,
		): Predicate => eq(application.insecticide_id, product.id),
		joinMethod: (
			application: HasColumn<Application, 'application_method_id'>,
			method: HasColumn<ApplicationMethod, 'id'>,
		): Predicate => eq(application.application_method_id, method.id),
		joinUnit: (
			application: HasColumn<Application, 'application_unit_id'>,
			unit: HasColumn<Unit, 'id'>,
		): Predicate => eq(application.application_unit_id, unit.id),
		joinPerformer: (
			application: HasColumn<Application, 'applicator_profile_id'>,
			performer: HasColumn<Profile, 'id'>,
		): Predicate => eq(application.applicator_profile_id, performer.id),
		measured: <
			TRef extends HasColumn<
				Application,
				| 'insecticide_id'
				| 'application_method_id'
				| 'applicator_profile_id'
				| 'amount_applied'
				| 'application_unit_id'
			>,
		>(
			application: TRef,
		): {
			productId: TRef['insecticide_id'];
			methodId: TRef['application_method_id'];
			performerProfileId: TRef['applicator_profile_id'];
			amount: TRef['amount_applied'];
			unitId: TRef['application_unit_id'];
		} => ({
			productId: application.insecticide_id,
			methodId: application.application_method_id,
			performerProfileId: application.applicator_profile_id,
			amount: application.amount_applied,
			unitId: application.application_unit_id,
		}),
	},
	sourceReductions: {
		date: ACTIVITY_DATES.sourceReductions.column,
		joinMethod: (
			reduction: HasColumn<SourceReduction, 'source_reduction_method_id'>,
			method: HasColumn<SourceReductionMethod, 'id'>,
		): Predicate => eq(reduction.source_reduction_method_id, method.id),
		joinUnit: (
			reduction: HasColumn<SourceReduction, 'sources_eliminated_unit_id'>,
			unit: HasColumn<Unit, 'id'>,
		): Predicate => eq(reduction.sources_eliminated_unit_id, unit.id),
		joinPerformer: (
			reduction: HasColumn<SourceReduction, 'technician_profile_id'>,
			performer: HasColumn<Profile, 'id'>,
		): Predicate => eq(reduction.technician_profile_id, performer.id),
		measured: <
			TRef extends HasColumn<
				SourceReduction,
				| 'source_reduction_method_id'
				| 'technician_profile_id'
				| 'sources_eliminated_amount'
				| 'sources_eliminated_unit_id'
			>,
		>(
			reduction: TRef,
		): {
			methodId: TRef['source_reduction_method_id'];
			performerProfileId: TRef['technician_profile_id'];
			amount: TRef['sources_eliminated_amount'];
			unitId: TRef['sources_eliminated_unit_id'];
		} => ({
			methodId: reduction.source_reduction_method_id,
			performerProfileId: reduction.technician_profile_id,
			amount: reduction.sources_eliminated_amount,
			unitId: reduction.sources_eliminated_unit_id,
		}),
	},
	releases: {
		date: ACTIVITY_DATES.releases.column,
		joinMethod: (
			release: HasColumn<BiocontrolAction, 'biocontrol_method_id'>,
			method: HasColumn<BiocontrolMethod, 'id'>,
		): Predicate => eq(release.biocontrol_method_id, method.id),
		joinUnit: (
			release: HasColumn<BiocontrolAction, 'release_unit_id'>,
			unit: HasColumn<Unit, 'id'>,
		): Predicate => eq(release.release_unit_id, unit.id),
		joinPerformer: (
			release: HasColumn<BiocontrolAction, 'technician_profile_id'>,
			performer: HasColumn<Profile, 'id'>,
		): Predicate => eq(release.technician_profile_id, performer.id),
		measured: <
			TRef extends HasColumn<
				BiocontrolAction,
				'biocontrol_method_id' | 'technician_profile_id' | 'amount_released' | 'release_unit_id'
			>,
		>(
			release: TRef,
		): {
			methodId: TRef['biocontrol_method_id'];
			performerProfileId: TRef['technician_profile_id'];
			amount: TRef['amount_released'];
			unitId: TRef['release_unit_id'];
		} => ({
			methodId: release.biocontrol_method_id,
			performerProfileId: release.technician_profile_id,
			amount: release.amount_released,
			unitId: release.release_unit_id,
		}),
	},
	/** No unit: the amount is reach, which counts people. */
	outreachActions: {
		date: ACTIVITY_DATES.outreachActions.column,
		joinMethod: (
			outreach: HasColumn<OutreachAction, 'outreach_method_id'>,
			method: HasColumn<OutreachMethod, 'id'>,
		): Predicate => eq(outreach.outreach_method_id, method.id),
		joinPerformer: (
			outreach: HasColumn<OutreachAction, 'technician_profile_id'>,
			performer: HasColumn<Profile, 'id'>,
		): Predicate => eq(outreach.technician_profile_id, performer.id),
		measured: <
			TRef extends HasColumn<
				OutreachAction,
				'outreach_method_id' | 'technician_profile_id' | 'reach'
			>,
		>(
			outreach: TRef,
		): {
			methodId: TRef['outreach_method_id'];
			performerProfileId: TRef['technician_profile_id'];
			amount: TRef['reach'];
		} => ({
			methodId: outreach.outreach_method_id,
			performerProfileId: outreach.technician_profile_id,
			amount: outreach.reach,
		}),
	},
} as const;

/**
 * The columns {@link controlActionBaseSelect} reads. `unknown` for the reason
 * `addressSelect`'s are: the generic passes each column's ref straight through.
 */
type ControlActionBaseColumns = {
	address_id: unknown;
	inspection_id: unknown;
	requested_control_action_id: unknown;
	mission_item_id: unknown;
	lat: unknown;
	lng: unknown;
	geom_type: unknown;
	metadata: unknown;
	created_at: unknown;
	updated_at: unknown;
	created_by_profile_id: unknown;
	updated_by_profile_id: unknown;
};

/**
 * The placement and audit fields every performed action carries, as the four
 * single-record hooks project them. `habitatId` is not here, because an
 * outreach action has no habitat.
 */
export function controlActionBaseSelect<TAction extends ControlActionBaseColumns>(
	action: TAction,
): {
	addressId: TAction['address_id'];
	inspectionId: TAction['inspection_id'];
	requestedControlActionId: TAction['requested_control_action_id'];
	missionItemId: TAction['mission_item_id'];
	latitude: TAction['lat'];
	longitude: TAction['lng'];
	geometryKind: TAction['geom_type'];
	metadata: TAction['metadata'];
	createdAt: TAction['created_at'];
	updatedAt: TAction['updated_at'];
	createdByProfileId: TAction['created_by_profile_id'];
	updatedByProfileId: TAction['updated_by_profile_id'];
} {
	return {
		addressId: action.address_id,
		inspectionId: action.inspection_id,
		requestedControlActionId: action.requested_control_action_id,
		missionItemId: action.mission_item_id,
		latitude: action.lat,
		longitude: action.lng,
		geometryKind: action.geom_type,
		metadata: action.metadata,
		createdAt: action.created_at,
		updatedAt: action.updated_at,
		createdByProfileId: action.created_by_profile_id,
		updatedByProfileId: action.updated_by_profile_id,
	};
}
