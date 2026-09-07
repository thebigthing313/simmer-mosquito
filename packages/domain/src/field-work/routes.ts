import {
	basePayload,
	createIssues,
	nullableText as normalizeNullableText,
	requiredId as normalizeRequiredId,
	requiredText as normalizeRequiredText,
	normalizeStringUnion,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateBase,
	validateIdCommand,
	validateIdList,
} from '../command-validation.js';
import type { DomainId } from '../shared.js';
import {
	nullableTextField,
	requiredTextField,
	type UpdateFieldSet,
	type UpdateFieldsChanges,
	type UpdateFieldsInput,
	updateFieldsCommand,
} from '../update-command-fields.js';
import {
	type FieldWorkCommandInput,
	type FieldWorkCommandPayload,
	type FieldWorkDomainCommand,
	ROUTE_ITEM_TARGET_TYPES,
	ROUTE_TYPES,
	type RouteItemPlacement,
	type RouteItemTarget,
	type RouteType,
	validateRoutePlacement,
	validateTarget,
} from './shared.js';

export interface CreateRouteCommandInput extends FieldWorkCommandInput {
	readonly routeId: DomainId;
	readonly routeName: string;
	readonly routeType: RouteType;
}

export type CreateRouteCommand = FieldWorkDomainCommand<
	'fieldWork.createRoute',
	FieldWorkCommandPayload & {
		readonly routeId: DomainId;
		readonly routeName: string;
		readonly routeType: RouteType;
	}
>;

export const ROUTE_UPDATE_FIELDS = {
	routeName: requiredTextField(200),
} satisfies UpdateFieldSet;

export type UpdateRouteDetailsCommandInput = FieldWorkCommandInput &
	UpdateFieldsInput<typeof ROUTE_UPDATE_FIELDS> & {
		readonly routeId: DomainId;
	};

export type UpdateRouteDetailsCommand = FieldWorkDomainCommand<
	'fieldWork.updateRouteDetails',
	FieldWorkCommandPayload & {
		readonly routeId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof ROUTE_UPDATE_FIELDS>;
	}
>;

export interface DeleteRouteCommandInput extends FieldWorkCommandInput {
	readonly routeId: DomainId;
	readonly acknowledgedRouteItemDeletion?: boolean;
}

export type DeleteRouteCommand = FieldWorkDomainCommand<
	'fieldWork.deleteRoute',
	FieldWorkCommandPayload & {
		readonly routeId: DomainId;
		readonly acknowledgedRouteItemDeletion: boolean;
	}
>;

export interface AddRouteItemCommandInput extends FieldWorkCommandInput {
	readonly routeItemId: DomainId;
	readonly routeId: DomainId;
	readonly target: RouteItemTarget;
	readonly placement?: RouteItemPlacement;
	readonly directionsToNextItem?: string | null;
}

export type AddRouteItemCommand = FieldWorkDomainCommand<
	'fieldWork.addRouteItem',
	FieldWorkCommandPayload & {
		readonly routeItemId: DomainId;
		readonly routeId: DomainId;
		readonly target: RouteItemTarget;
		readonly placement: RouteItemPlacement;
		readonly directionsToNextItem: string | null;
	}
>;

export const ROUTE_ITEM_UPDATE_FIELDS = {
	directionsToNextItem: nullableTextField(4_000),
} satisfies UpdateFieldSet;

export type UpdateRouteItemCommandInput = FieldWorkCommandInput &
	UpdateFieldsInput<typeof ROUTE_ITEM_UPDATE_FIELDS> & {
		readonly routeItemId: DomainId;
	};

export type UpdateRouteItemCommand = FieldWorkDomainCommand<
	'fieldWork.updateRouteItem',
	FieldWorkCommandPayload & {
		readonly routeItemId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof ROUTE_ITEM_UPDATE_FIELDS>;
	}
>;

export interface RouteItemIdCommandInput extends FieldWorkCommandInput {
	readonly routeItemId: DomainId;
}

export type RemoveRouteItemCommand = FieldWorkDomainCommand<
	'fieldWork.removeRouteItem',
	FieldWorkCommandPayload & { readonly routeItemId: DomainId }
>;

export interface MoveRouteItemsCommandInput extends FieldWorkCommandInput {
	readonly routeId: DomainId;
	readonly routeItemIds: readonly DomainId[];
	readonly placement: RouteItemPlacement;
}

export type MoveRouteItemsCommand = FieldWorkDomainCommand<
	'fieldWork.moveRouteItems',
	FieldWorkCommandPayload & {
		readonly routeId: DomainId;
		readonly routeItemIds: readonly DomainId[];
		readonly placement: RouteItemPlacement;
	}
>;

export function createRouteCommand(input: CreateRouteCommandInput): CreateRouteCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.routeId, 'routeId', issues);
	const routeName = normalizeRequiredText(input.routeName, 'routeName', issues, 200);
	const routeType = normalizeStringUnion(input.routeType, ROUTE_TYPES, 'routeType', issues);
	throwIfIssues('Create route command is invalid.', issues);

	return {
		type: 'fieldWork.createRoute',
		payload: {
			...basePayload(input),
			routeId: normalizeRequiredId(input.routeId),
			routeName,
			routeType,
		},
	};
}

export function updateRouteDetailsCommand(
	input: UpdateRouteDetailsCommandInput,
): UpdateRouteDetailsCommand {
	return updateFieldsCommand({
		type: 'fieldWork.updateRouteDetails',
		input,
		idKey: 'routeId',
		fields: ROUTE_UPDATE_FIELDS,
		changeNoun: 'route',
		emptyChangeMessage: 'At least one route detail must change.',
		message: 'Update route details command is invalid.',
	});
}

export function deleteRouteCommand(input: DeleteRouteCommandInput): DeleteRouteCommand {
	const issues = validateIdCommand(input, 'routeId');
	throwIfIssues('Delete route command is invalid.', issues);
	return {
		type: 'fieldWork.deleteRoute',
		payload: {
			...basePayload(input),
			routeId: normalizeRequiredId(input.routeId),
			acknowledgedRouteItemDeletion: input.acknowledgedRouteItemDeletion ?? false,
		},
	};
}

export function addRouteItemCommand(input: AddRouteItemCommandInput): AddRouteItemCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.routeItemId, 'routeItemId', issues);
	requireUuid(input.routeId, 'routeId', issues);
	const target = validateTarget(
		input.target,
		ROUTE_ITEM_TARGET_TYPES,
		'target',
		issues,
		requireUuid,
	);
	const placement = validateRoutePlacement(
		input.placement ?? { kind: 'end' },
		'placement',
		issues,
		requireUuid,
	);
	const directionsToNextItem = normalizeNullableText(
		input.directionsToNextItem,
		'directionsToNextItem',
		issues,
		4_000,
	);
	throwIfIssues('Add route item command is invalid.', issues);

	return {
		type: 'fieldWork.addRouteItem',
		payload: {
			...basePayload(input),
			routeItemId: normalizeRequiredId(input.routeItemId),
			routeId: normalizeRequiredId(input.routeId),
			target,
			placement,
			directionsToNextItem,
		},
	};
}

export function updateRouteItemCommand(input: UpdateRouteItemCommandInput): UpdateRouteItemCommand {
	return updateFieldsCommand({
		type: 'fieldWork.updateRouteItem',
		input,
		idKey: 'routeItemId',
		fields: ROUTE_ITEM_UPDATE_FIELDS,
		changeNoun: 'route item',
		message: 'Update route item command is invalid.',
	});
}

export function removeRouteItemCommand(input: RouteItemIdCommandInput): RemoveRouteItemCommand {
	const issues = validateIdCommand(input, 'routeItemId');
	throwIfIssues('Remove route item command is invalid.', issues);
	return {
		type: 'fieldWork.removeRouteItem',
		payload: { ...basePayload(input), routeItemId: normalizeRequiredId(input.routeItemId) },
	};
}

export function moveRouteItemsCommand(input: MoveRouteItemsCommandInput): MoveRouteItemsCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.routeId, 'routeId', issues);
	const routeItemIds = validateIdList(input.routeItemIds, 'routeItemIds', issues);
	const placement = validateRoutePlacement(input.placement, 'placement', issues, requireUuid);
	throwIfIssues('Move route items command is invalid.', issues);

	return {
		type: 'fieldWork.moveRouteItems',
		payload: {
			...basePayload(input),
			routeId: normalizeRequiredId(input.routeId),
			routeItemIds,
			placement,
		},
	};
}
