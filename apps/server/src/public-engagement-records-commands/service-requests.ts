import { randomUUID } from 'node:crypto';
import { applyRecordDeletion, sql } from '@simmer-mosquito/db';
import {
	type ContactReferenceInput,
	closeServiceRequestCommand,
	createServiceRequestCommand,
	deleteServiceRequestCommand,
	type PublicEngagementCommand,
	reopenServiceRequestCommand,
	type ServiceRequestLocationInput,
	updateServiceRequestContactCommand,
	updateServiceRequestDetailsCommand,
	updateServiceRequestLocationCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import { readNullableText, readText } from '../command-payload.js';
import { insertLifecycleComment } from '../lifecycle-comment.js';
import {
	agencyCommandContext,
	type CommandContext,
	type CommandsResult,
	commandEndpoint,
	createCommand,
	geojsonToGeom,
	invalidUpdate,
	localDateColumn,
	type PublicEngagementDb,
	type PublicEngagementTransaction,
	type RouteOptions,
	readDate,
	resolveContact,
	resolveServiceRequestAddress,
	runCommands,
	type SafeServiceRequest,
	serviceRequestReturnColumns,
	softDelete,
	toSafeServiceRequest,
	updateRow,
} from './shared.js';

// ===========================================================================
// Service requests
// ===========================================================================

export function registerServiceRequestRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/public-engagement/service-requests',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				createServiceRequestCommand({
					...ctx,
					serviceRequestId: readText(payload.id) ?? '',
					contact: payload.contact as ContactReferenceInput,
					location: payload.location as ServiceRequestLocationInput,
					intakeType: (readText(payload.intakeType) ?? '') as never,
					requestDate: readText(payload.requestDate) ?? '',
					details: readText(payload.details) ?? '',
					receivedByProfileId: readNullableText(payload.receivedByProfileId),
				}),
			run: (context, commands) => runServiceRequestCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/public-engagement/service-requests/:serviceRequestId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, authContext, param }) =>
				buildServiceRequestUpdateCommands(authContext, param('serviceRequestId'), payload),
			run: (context, commands) => runServiceRequestCommands(context, options.db, commands),
		}),
	);

	app.post(
		'/public-engagement/service-requests/:serviceRequestId/contact',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx, param }) =>
				updateServiceRequestContactCommand({
					...ctx,
					serviceRequestId: param('serviceRequestId'),
					contact: payload.contact as ContactReferenceInput,
				}),
			run: (context, commands) => runServiceRequestCommands(context, options.db, commands),
		}),
	);

	app.post(
		'/public-engagement/service-requests/:serviceRequestId/location',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx, param }) =>
				updateServiceRequestLocationCommand({
					...ctx,
					serviceRequestId: param('serviceRequestId'),
					location: payload.location as ServiceRequestLocationInput,
				}),
			run: (context, commands) => runServiceRequestCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/public-engagement/service-requests/:serviceRequestId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				deleteServiceRequestCommand({
					...ctx,
					serviceRequestId: param('serviceRequestId'),
				}),
			run: (context, commands) => runServiceRequestCommands(context, options.db, commands),
		}),
	);
}

function buildServiceRequestUpdateCommands(
	authContext: AuthContext,
	serviceRequestId: string,
	payload: Record<string, unknown>,
): CommandsResult {
	const ctx = agencyCommandContext(authContext);
	const commands: PublicEngagementCommand[] = [];

	const detailKeys = ['requestDate', 'intakeType', 'receivedByProfileId', 'details'];
	if (detailKeys.some((key) => key in payload)) {
		const result = createCommand(() =>
			updateServiceRequestDetailsCommand({
				...ctx,
				serviceRequestId,
				...('requestDate' in payload ? { requestDate: readText(payload.requestDate) ?? '' } : {}),
				...('intakeType' in payload
					? { intakeType: (readText(payload.intakeType) ?? '') as never }
					: {}),
				...('receivedByProfileId' in payload
					? { receivedByProfileId: readNullableText(payload.receivedByProfileId) }
					: {}),
				...('details' in payload ? { details: readText(payload.details) ?? '' } : {}),
				acknowledgedClosedRequestChange: true,
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if ('contactId' in payload) {
		const result = createCommand(() =>
			updateServiceRequestContactCommand({
				...ctx,
				serviceRequestId,
				contact: { kind: 'existing', contactId: readText(payload.contactId) ?? '' },
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if ('closedAt' in payload) {
		const closedAt = readDate(payload.closedAt);
		const result = createCommand(() =>
			closedAt !== null
				? closeServiceRequestCommand({
						...ctx,
						serviceRequestId,
						resolutionCommentId: randomUUID(),
						resolutionSummary: readText(payload.resolutionSummary) ?? 'Closed',
						closedAt,
					})
				: reopenServiceRequestCommand({
						...ctx,
						serviceRequestId,
						reopenCommentId: randomUUID(),
						reopenReason: readText(payload.reopenReason) ?? 'Reopened',
					}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('service request');
	}
	return { ok: true, commands };
}

async function runServiceRequestCommands(
	context: CommandContext,
	db: PublicEngagementDb,
	commands: readonly PublicEngagementCommand[],
	createdStatus?: 201,
) {
	return runCommands(
		context,
		{
			db,
			write: writeServiceRequestCommand,
			notFound: 'service_request_not_found',
			key: 'serviceRequest',
		},
		commands,
		createdStatus,
	);
}

/** The payload of one command in the union, by its `type`. */
type ServiceRequestPayload<T extends PublicEngagementCommand['type']> = Extract<
	PublicEngagementCommand,
	{ type: T }
>['payload'];

/**
 * Which command runs which write. Every arm is a named function below, so this
 * switch stays a routing table rather than the place the work happens.
 */
async function writeServiceRequestCommand(
	trx: PublicEngagementTransaction,
	command: PublicEngagementCommand,
): Promise<SafeServiceRequest | null> {
	switch (command.type) {
		case 'publicEngagement.createServiceRequest':
			return insertServiceRequest(trx, command.payload);
		case 'publicEngagement.updateServiceRequestDetails':
			return updateServiceRequestDetails(trx, command.payload);
		case 'publicEngagement.updateServiceRequestContact':
			return reassignServiceRequestContact(trx, command.payload);
		case 'publicEngagement.updateServiceRequestLocation':
			return moveServiceRequest(trx, command.payload);
		case 'publicEngagement.closeServiceRequest':
			return closeServiceRequest(trx, command.payload);
		case 'publicEngagement.reopenServiceRequest':
			return reopenServiceRequest(trx, command.payload);
		case 'publicEngagement.deleteServiceRequest':
			return deleteServiceRequest(trx, command.payload);
		default:
			throw new Error(`Unsupported service request command: ${command.type}`);
	}
}

async function insertServiceRequest(
	trx: PublicEngagementTransaction,
	payload: ServiceRequestPayload<'publicEngagement.createServiceRequest'>,
): Promise<SafeServiceRequest> {
	const contactId = await resolveContact(
		trx,
		payload.organizationId,
		payload.contact,
		payload.actorProfileId,
	);
	const addressId = await resolveServiceRequestAddress(
		trx,
		payload.organizationId,
		payload.location.address,
		payload.actorProfileId,
	);
	const row = await trx
		.insertInto('service_requests')
		.values({
			id: payload.serviceRequestId,
			organization_id: payload.organizationId,
			intake_type: payload.intakeType,
			request_date: localDateColumn(payload.requestDate),
			geom: geojsonToGeom(payload.location.geometry),
			address_id: addressId,
			contact_id: contactId,
			received_by_profile_id: payload.receivedByProfileId,
			details: payload.details,
			created_by_profile_id: payload.actorProfileId,
			updated_by_profile_id: payload.actorProfileId,
		})
		.returning(serviceRequestReturnColumns)
		.executeTakeFirstOrThrow();
	return toSafeServiceRequest(row);
}

async function updateServiceRequestDetails(
	trx: PublicEngagementTransaction,
	payload: ServiceRequestPayload<'publicEngagement.updateServiceRequestDetails'>,
): Promise<SafeServiceRequest | null> {
	const { changes } = payload;
	return updateServiceRequest(trx, payload.serviceRequestId, payload.organizationId, {
		...('requestDate' in changes && changes.requestDate !== undefined
			? { request_date: localDateColumn(changes.requestDate) }
			: {}),
		...('intakeType' in changes ? { intake_type: changes.intakeType } : {}),
		...('receivedByProfileId' in changes
			? { received_by_profile_id: changes.receivedByProfileId ?? null }
			: {}),
		...('details' in changes ? { details: changes.details } : {}),
		updated_by_profile_id: payload.actorProfileId,
	});
}

async function reassignServiceRequestContact(
	trx: PublicEngagementTransaction,
	payload: ServiceRequestPayload<'publicEngagement.updateServiceRequestContact'>,
): Promise<SafeServiceRequest | null> {
	const contactId = await resolveContact(
		trx,
		payload.organizationId,
		payload.contact,
		payload.actorProfileId,
	);
	return updateServiceRequest(trx, payload.serviceRequestId, payload.organizationId, {
		contact_id: contactId,
		updated_by_profile_id: payload.actorProfileId,
	});
}

async function moveServiceRequest(
	trx: PublicEngagementTransaction,
	payload: ServiceRequestPayload<'publicEngagement.updateServiceRequestLocation'>,
): Promise<SafeServiceRequest | null> {
	const addressId = await resolveServiceRequestAddress(
		trx,
		payload.organizationId,
		payload.location.address,
		payload.actorProfileId,
	);
	return updateServiceRequest(trx, payload.serviceRequestId, payload.organizationId, {
		geom: geojsonToGeom(payload.location.geometry),
		address_id: addressId,
		updated_by_profile_id: payload.actorProfileId,
	});
}

async function closeServiceRequest(
	trx: PublicEngagementTransaction,
	payload: ServiceRequestPayload<'publicEngagement.closeServiceRequest'>,
): Promise<SafeServiceRequest | null> {
	const closed = await updateServiceRequest(trx, payload.serviceRequestId, payload.organizationId, {
		closed_at: payload.closedAt === null ? sql`now()` : payload.closedAt,
		closed_by_profile_id: payload.actorProfileId,
		updated_by_profile_id: payload.actorProfileId,
	});
	if (closed === null) {
		return null;
	}
	await insertLifecycleComment(trx, {
		commentId: payload.resolutionCommentId,
		organizationId: payload.organizationId,
		entityType: 'serviceRequest',
		entityId: payload.serviceRequestId,
		commentText: payload.resolutionSummary,
		commentedAt: payload.closedAt,
		actorProfileId: payload.actorProfileId,
	});
	return closed;
}

async function reopenServiceRequest(
	trx: PublicEngagementTransaction,
	payload: ServiceRequestPayload<'publicEngagement.reopenServiceRequest'>,
): Promise<SafeServiceRequest | null> {
	const reopened = await updateServiceRequest(
		trx,
		payload.serviceRequestId,
		payload.organizationId,
		{
			closed_at: null,
			closed_by_profile_id: null,
			updated_by_profile_id: payload.actorProfileId,
		},
	);
	if (reopened === null) {
		return null;
	}
	// There is no `reopened_at` column in v1, so this comment is the only record
	// that the reopen happened at all, and the only place its reason can live.
	await insertLifecycleComment(trx, {
		commentId: payload.reopenCommentId,
		organizationId: payload.organizationId,
		entityType: 'serviceRequest',
		entityId: payload.serviceRequestId,
		commentText: payload.reopenReason,
		commentedAt: payload.reopenedAt,
		actorProfileId: payload.actorProfileId,
	});
	return reopened;
}

async function deleteServiceRequest(
	trx: PublicEngagementTransaction,
	payload: ServiceRequestPayload<'publicEngagement.deleteServiceRequest'>,
): Promise<SafeServiceRequest | null> {
	await applyRecordDeletion(trx, {
		recordType: 'serviceRequest',
		recordId: payload.serviceRequestId,
		organizationId: payload.organizationId,
		actorProfileId: payload.actorProfileId,
	});
	return softDelete(
		trx,
		'service_requests',
		payload.serviceRequestId,
		payload.organizationId,
		payload.actorProfileId,
		serviceRequestReturnColumns,
		toSafeServiceRequest,
	);
}

async function updateServiceRequest(
	trx: PublicEngagementTransaction,
	serviceRequestId: string,
	organizationId: string,
	set: Record<string, unknown>,
): Promise<SafeServiceRequest | null> {
	return updateRow(
		trx,
		'service_requests',
		serviceRequestId,
		organizationId,
		set,
		serviceRequestReturnColumns,
		toSafeServiceRequest,
	);
}
