import {
	createIssues,
	nullableText as normalizeNullableText,
	requiredId as normalizeRequiredId,
	requiredText as normalizeRequiredText,
	requiredUuid as requireUuid,
	throwIfIssues,
} from '../command-validation.js';
import type { DomainId } from '../shared.js';
import {
	basePayload,
	type FieldWorkCommandInput,
	type FieldWorkCommandPayload,
	type FieldWorkDomainCommand,
	normalizeStringUnion,
	ROUTE_ITEM_TARGET_TYPES,
	ROUTE_TYPES,
	type RouteItemPlacement,
	type RouteItemTarget,
	type RouteType,
	validateBase,
	validateIdCommand,
	validateIdList,
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

export interface UpdateRouteDetailsCommandInput extends FieldWorkCommandInput {
	readonly routeId: DomainId;
	readonly routeName?: string;
}

export type UpdateRouteDetailsCommand = FieldWorkDomainCommand<
	'fieldWork.updateRouteDetails',
	FieldWorkCommandPayload & {
		readonly routeId: DomainId;
		readonly changes: Readonly<{ readonly routeName?: string }>;
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

export interface UpdateRouteItemCommandInput extends FieldWorkCommandInput {
	readonly routeItemId: DomainId;
	readonly directionsToNextItem?: string | null;
}

export type UpdateRouteItemCommand = FieldWorkDomainCommand<
	'fieldWork.updateRouteItem',
	FieldWorkCommandPayload & {
		readonly routeItemId: DomainId;
		readonly changes: Readonly<{ readonly directionsToNextItem?: string | null }>;
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
	const issues = validateIdCommand(input, 'routeId', requireUuid);
	const hasName = input.routeName !== undefined;
	if (!hasName) {
		issues.push({ path: 'changes', message: 'At least one route detail must change.' });
	}
	const routeName = hasName
		? normalizeRequiredText(input.routeName, 'routeName', issues, 200)
		: undefined;
	throwIfIssues('Update route details command is invalid.', issues);

	return {
		type: 'fieldWork.updateRouteDetails',
		payload: {
			...basePayload(input),
			routeId: normalizeRequiredId(input.routeId),
			changes: { ...(routeName !== undefined ? { routeName } : {}) },
		},
	};
}

export function deleteRouteCommand(input: DeleteRouteCommandInput): DeleteRouteCommand {
	const issues = validateIdCommand(input, 'routeId', requireUuid);
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
	const issues = validateIdCommand(input, 'routeItemId', requireUuid);
	const hasDirections = input.directionsToNextItem !== undefined;
	if (!hasDirections) {
		issues.push({ path: 'changes', message: 'At least one route item field must change.' });
	}
	const directionsToNextItem = hasDirections
		? normalizeNullableText(input.directionsToNextItem, 'directionsToNextItem', issues, 4_000)
		: undefined;
	throwIfIssues('Update route item command is invalid.', issues);

	return {
		type: 'fieldWork.updateRouteItem',
		payload: {
			...basePayload(input),
			routeItemId: normalizeRequiredId(input.routeItemId),
			changes: { ...(hasDirections ? { directionsToNextItem: directionsToNextItem ?? null } : {}) },
		},
	};
}

export function removeRouteItemCommand(input: RouteItemIdCommandInput): RemoveRouteItemCommand {
	const issues = validateIdCommand(input, 'routeItemId', requireUuid);
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
	const routeItemIds = validateIdList(input.routeItemIds, 'routeItemIds', issues, requireUuid);
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
