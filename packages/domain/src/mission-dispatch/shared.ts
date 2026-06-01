import {
	createIssues,
	jsonObject as normalizeMetadata,
	optionalUuid as normalizeOptionalUuid,
	requiredId as normalizeRequiredId,
	requiredUuid as requireUuid,
	validateAgencyCommandContext,
	validateLocalDate,
} from '../command-validation.js';
import {
	type MissionItemLocationSource,
	type MissionItemLocationSourceInput,
	validateMissionItemLocationSource,
} from '../location-intent.js';
import type { ControlActionContext } from '../performed-control-actions.js';
import {
	type DomainId,
	DomainValidationError,
	type DomainValidationIssue,
	type JsonObject,
	type LocalDateString,
	normalizeLocatableGeometry,
	type SupportedGeoJsonGeometry,
} from '../shared.js';

export type MissionLifecycleStatus =
	| 'scheduled'
	| 'inProgress'
	| 'completed'
	| 'cancelled'
	| 'deleted';

export type MissionItemStatus = 'pending' | 'completed' | 'skipped' | 'deleted';

export type MissionDispatchCommandType =
	| 'missionDispatch.createMission'
	| 'missionDispatch.updateMissionDetails'
	| 'missionDispatch.updateMissionSchedule'
	| 'missionDispatch.updateMissionPlan'
	| 'missionDispatch.assignMission'
	| 'missionDispatch.updateMissionNotificationType'
	| 'missionDispatch.startMission'
	| 'missionDispatch.completeMission'
	| 'missionDispatch.cancelMission'
	| 'missionDispatch.reopenMission'
	| 'missionDispatch.deleteMission'
	| 'missionDispatch.addMissionItem'
	| 'missionDispatch.addMissionItemFromRequestedControlAction'
	| 'missionDispatch.updateMissionItemLocationAndLink'
	| 'missionDispatch.removeMissionItem'
	| 'missionDispatch.moveMissionItems'
	| 'missionDispatch.completeMissionItem'
	| 'missionDispatch.reopenMissionItem'
	| 'missionDispatch.skipMissionItem'
	| 'missionDispatch.unskipMissionItem'
	| 'missionDispatch.recordChemicalApplicationForMissionItem'
	| 'missionDispatch.recordSourceReductionForMissionItem'
	| 'missionDispatch.recordOutreachActionForMissionItem'
	| 'missionDispatch.recordBiocontrolActionForMissionItem';

export interface MissionDispatchDomainCommand<TType extends MissionDispatchCommandType, TPayload> {
	readonly type: TType;
	readonly payload: TPayload;
}

export interface MissionDispatchCommandInput {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface MissionDispatchCommandPayload {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export type MissionItemPlacement =
	| { readonly kind: 'start' }
	| { readonly kind: 'end' }
	| { readonly kind: 'before'; readonly missionItemId: DomainId }
	| { readonly kind: 'after'; readonly missionItemId: DomainId };

export type MissionInitialItemInput =
	| {
			readonly kind: 'explicit';
			readonly missionItemId: DomainId;
			readonly geometry?: unknown;
			readonly locationSource?: MissionItemLocationSourceInput;
			readonly addressId?: DomainId | null;
			readonly requestedControlActionId?: DomainId | null;
	  }
	| {
			readonly kind: 'fromRequestedControlAction';
			readonly missionItemId: DomainId;
			readonly requestedControlActionId: DomainId;
	  };

export type MissionInitialItem =
	| {
			readonly kind: 'explicit';
			readonly missionItemId: DomainId;
			readonly geometry?: SupportedGeoJsonGeometry;
			readonly locationSource?: MissionItemLocationSource;
			readonly addressId: DomainId | null;
			readonly requestedControlActionId: DomainId | null;
	  }
	| {
			readonly kind: 'fromRequestedControlAction';
			readonly missionItemId: DomainId;
			readonly requestedControlActionId: DomainId;
	  };

export interface MissionItemLocationInput {
	readonly geometry?: unknown;
	readonly locationSource?: MissionItemLocationSourceInput;
	readonly addressId?: DomainId | null;
	readonly requestedControlActionId?: DomainId | null;
}

export interface MissionExecutionOptions {
	readonly completeMissionItem?: boolean;
	readonly autoStartMission?: boolean;
	readonly acknowledgedMissionGeometryNotCovered?: boolean;
	readonly acknowledgedMethodMismatch?: boolean;
	readonly acknowledgedRequestedActionMismatch?: boolean;
	readonly acknowledgedOutOfScheduleAction?: boolean;
	readonly acknowledgedCompletedItemAdditionalAction?: boolean;
}

export interface MissionExecutionOverrides {
	readonly geometry?: unknown;
	readonly addressId?: DomainId | null;
	readonly requestedControlActionId?: DomainId | null;
	readonly context?: import('../performed-control-actions.js').ControlActionContext;
	readonly metadata?: unknown | null;
}

export type MissionExecutionPayload = {
	readonly completeMissionItem: boolean;
	readonly autoStartMission: boolean;
	readonly acknowledgedMissionGeometryNotCovered: boolean;
	readonly acknowledgedMethodMismatch: boolean;
	readonly acknowledgedRequestedActionMismatch: boolean;
	readonly acknowledgedOutOfScheduleAction: boolean;
	readonly acknowledgedCompletedItemAdditionalAction: boolean;
	readonly geometry?: SupportedGeoJsonGeometry;
	readonly addressId?: DomainId | null;
	readonly requestedControlActionId?: DomainId | null;
	readonly context?: import('../performed-control-actions.js').ControlActionContext;
	readonly metadata: JsonObject | null;
};

export const CONTROL_TYPES = ['application', 'source_reduction', 'biocontrol', 'outreach'] as const;

export function validateBase(
	input: MissionDispatchCommandInput,
	issues: DomainValidationIssue[],
): void {
	validateAgencyCommandContext(input, issues);
}

export function validateIdCommand<T extends MissionDispatchCommandInput>(
	input: T,
	idKey: keyof T & string,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input[idKey] as string | undefined, idKey, issues);
	return issues;
}

export function basePayload(input: MissionDispatchCommandInput): MissionDispatchCommandPayload {
	return validateAgencyCommandContext(input, createIssues());
}

export function validateLocatableGeometry(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): SupportedGeoJsonGeometry {
	try {
		return normalizeLocatableGeometry(value, path);
	} catch (error) {
		if (error instanceof DomainValidationError) {
			issues.push(...error.issues);
			return { type: 'Point', coordinates: [0, 0] };
		}
		throw error;
	}
}

export function validateTimestampOrder(
	start: Date | undefined,
	end: Date | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	if (start !== undefined && end != null && end.getTime() <= start.getTime()) {
		issues.push({ path, message: `${path} must be after scheduledStartAt.` });
	}
}

export function normalizeOptionalLocalDate(
	value: LocalDateString | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): LocalDateString | null {
	if (value === undefined || value === null) {
		return null;
	}
	validateLocalDate(value, path, issues);
	return value;
}

export function normalizeTimestamp(
	value: Date | undefined,
	path: string,
	issues: DomainValidationIssue[],
	allowFuture: boolean,
): Date {
	if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
		issues.push({ path, message: `${path} must be a valid Date.` });
		return new Date(0);
	}
	if (!allowFuture && value.getTime() > Date.now()) {
		issues.push({ path, message: `${path} cannot be in the future.` });
	}
	return value;
}

export function normalizeOptionalTimestamp(
	value: Date | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
	allowFuture: boolean,
): Date | null {
	if (value === undefined || value === null) {
		return null;
	}
	return normalizeTimestamp(value, path, issues, allowFuture);
}

export function normalizeStringUnion<TValue extends string>(
	value: string | undefined,
	allowedValues: readonly TValue[],
	path: string,
	issues: DomainValidationIssue[],
): TValue {
	if (value === undefined || !allowedValues.includes(value as TValue)) {
		issues.push({ path, message: `${path} is not supported.` });
		return (allowedValues[0] ?? '') as TValue;
	}
	return value as TValue;
}

export function validateMissionItemPlacement(
	placement: MissionItemPlacement | undefined,
	path: string,
	issues: DomainValidationIssue[],
): MissionItemPlacement {
	if (placement === undefined || !['start', 'end', 'before', 'after'].includes(placement.kind)) {
		issues.push({ path, message: 'placement is not supported.' });
		return { kind: 'end' };
	}
	if (placement.kind === 'before' || placement.kind === 'after') {
		requireUuid(placement.missionItemId, `${path}.missionItemId`, issues);
		return { kind: placement.kind, missionItemId: normalizeRequiredId(placement.missionItemId) };
	}
	return { kind: placement.kind };
}

export function validateIdList(
	values: readonly DomainId[],
	path: string,
	issues: DomainValidationIssue[],
): readonly DomainId[] {
	if (!Array.isArray(values) || values.length === 0) {
		issues.push({ path, message: `${path} must include at least one id.` });
		return [];
	}
	const seen = new Set<string>();
	return values.map((value, index) => {
		requireUuid(value, `${path}.${index}`, issues);
		const normalized = normalizeRequiredId(value);
		if (seen.has(normalized)) {
			issues.push({ path: `${path}.${index}`, message: `${path} must not contain duplicates.` });
		}
		seen.add(normalized);
		return normalized;
	});
}

export function validateMissionItemLocationInput(
	input: {
		readonly geometry?: unknown;
		readonly locationSource?: MissionItemLocationSourceInput;
	},
	path: string,
	issues: DomainValidationIssue[],
	required: boolean,
): Readonly<{
	readonly geometry?: SupportedGeoJsonGeometry;
	readonly locationSource?: MissionItemLocationSource;
}> {
	const hasGeometry = input.geometry !== undefined;
	const hasLocationSource = input.locationSource !== undefined;
	if (hasGeometry && hasLocationSource) {
		issues.push({
			path,
			message: 'Mission item location requires geometry or locationSource, not both.',
		});
	}
	if (!hasGeometry && !hasLocationSource) {
		if (required) {
			issues.push({
				path,
				message: 'Mission item location requires geometry or locationSource.',
			});
		}
		return {};
	}
	if (hasGeometry) {
		return { geometry: validateLocatableGeometry(input.geometry, `${path}.geometry`, issues) };
	}
	return {
		locationSource: validateMissionItemLocationSource(
			input.locationSource,
			`${path}.locationSource`,
			issues,
		),
	};
}

export function validateInitialItems(
	values: readonly MissionInitialItemInput[],
	issues: DomainValidationIssue[],
): readonly MissionInitialItem[] {
	if (!Array.isArray(values)) {
		issues.push({ path: 'items', message: 'items must be an array.' });
		return [];
	}
	const itemIds = new Set<string>();
	return values.map((item, index) => {
		const path = `items.${index}`;
		if (item?.kind === 'explicit') {
			requireUuid(item.missionItemId, `${path}.missionItemId`, issues);
			const missionItemId = normalizeRequiredId(item.missionItemId);
			if (itemIds.has(missionItemId)) {
				issues.push({
					path: `${path}.missionItemId`,
					message: 'missionItemId values must be unique.',
				});
			}
			itemIds.add(missionItemId);
			return {
				kind: 'explicit',
				missionItemId,
				...validateMissionItemLocationInput(item, `${path}.location`, issues, true),
				addressId: normalizeOptionalUuid(item.addressId, `${path}.addressId`, issues),
				requestedControlActionId: normalizeOptionalUuid(
					item.requestedControlActionId,
					`${path}.requestedControlActionId`,
					issues,
				),
			};
		}
		if (item?.kind === 'fromRequestedControlAction') {
			requireUuid(item.missionItemId, `${path}.missionItemId`, issues);
			requireUuid(item.requestedControlActionId, `${path}.requestedControlActionId`, issues);
			const missionItemId = normalizeRequiredId(item.missionItemId);
			if (itemIds.has(missionItemId)) {
				issues.push({
					path: `${path}.missionItemId`,
					message: 'missionItemId values must be unique.',
				});
			}
			itemIds.add(missionItemId);
			return {
				kind: 'fromRequestedControlAction',
				missionItemId,
				requestedControlActionId: normalizeRequiredId(item.requestedControlActionId),
			};
		}
		issues.push({ path: `${path}.kind`, message: 'Mission item kind is not supported.' });
		return {
			kind: 'fromRequestedControlAction',
			missionItemId: '',
			requestedControlActionId: '',
		};
	});
}

export function validateMissionExecutionBase(
	input: MissionDispatchCommandInput &
		MissionExecutionOptions &
		MissionExecutionOverrides & { readonly missionItemId: DomainId },
	allowedFor: 'chemicalApplication' | 'sourceReduction' | 'outreach' | 'biocontrol',
	validateControlActionContext: (
		value: ControlActionContext,
		allowedFor: 'chemicalApplication' | 'sourceReduction' | 'outreach' | 'biocontrol',
		issues: DomainValidationIssue[],
	) => ControlActionContext,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.missionItemId, 'missionItemId', issues);
	if (input.geometry !== undefined) {
		validateLocatableGeometry(input.geometry, 'geometry', issues);
	}
	if (input.addressId !== undefined) {
		normalizeOptionalUuid(input.addressId, 'addressId', issues);
	}
	if (input.requestedControlActionId !== undefined) {
		normalizeOptionalUuid(input.requestedControlActionId, 'requestedControlActionId', issues);
	}
	if (input.context !== undefined) {
		validateControlActionContext(input.context, allowedFor, issues);
	}
	normalizeMetadata(input.metadata, 'metadata', issues);
	return issues;
}

export function missionExecutionPayload(
	input: MissionExecutionOptions & MissionExecutionOverrides,
	allowedFor: 'chemicalApplication' | 'sourceReduction' | 'outreach' | 'biocontrol',
	issues: DomainValidationIssue[],
	validateControlActionContext: (
		value: ControlActionContext,
		allowedFor: 'chemicalApplication' | 'sourceReduction' | 'outreach' | 'biocontrol',
		issues: DomainValidationIssue[],
	) => ControlActionContext,
): MissionExecutionPayload {
	return {
		completeMissionItem: input.completeMissionItem ?? true,
		autoStartMission: input.autoStartMission ?? true,
		acknowledgedMissionGeometryNotCovered: input.acknowledgedMissionGeometryNotCovered ?? false,
		acknowledgedMethodMismatch: input.acknowledgedMethodMismatch ?? false,
		acknowledgedRequestedActionMismatch: input.acknowledgedRequestedActionMismatch ?? false,
		acknowledgedOutOfScheduleAction: input.acknowledgedOutOfScheduleAction ?? false,
		acknowledgedCompletedItemAdditionalAction:
			input.acknowledgedCompletedItemAdditionalAction ?? false,
		...(input.geometry !== undefined
			? { geometry: validateLocatableGeometry(input.geometry, 'geometry', issues) }
			: {}),
		...(input.addressId !== undefined
			? { addressId: normalizeOptionalUuid(input.addressId, 'addressId', issues) }
			: {}),
		...(input.requestedControlActionId !== undefined
			? {
					requestedControlActionId: normalizeOptionalUuid(
						input.requestedControlActionId,
						'requestedControlActionId',
						issues,
					),
				}
			: {}),
		...(input.context !== undefined
			? { context: validateControlActionContext(input.context, allowedFor, issues) }
			: {}),
		metadata: normalizeMetadata(input.metadata, 'metadata', issues),
	};
}
