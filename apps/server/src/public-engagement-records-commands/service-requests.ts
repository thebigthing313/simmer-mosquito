import { randomUUID } from 'node:crypto';
import { applyRecordDeletion, checkedValues, sql } from '@simmer-mosquito/db';
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
import { requireStateAcknowledgement } from '../acknowledgements.js';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import { acknowledged, readNullableText, readText } from '../command-payload.js';
import { insertLifecycleComment } from '../lifecycle-comment.js';
import { assertCitedHistoryAcknowledged } from '../record-history.js';
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
	type ServiceRequestRow,
	serviceRequestReturnColumns,
	softDelete,
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
					acknowledgedHistoricalContactChange: acknowledged(
						payload.acknowledgedHistoricalContactChange,
					),
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
					acknowledgedHistoricalLocationChange: acknowledged(
						payload.acknowledgedHistoricalLocationChange,
					),
				}),
			run: (context, commands) => runServiceRequestCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/public-engagement/service-requests/:serviceRequestId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'optional',
			build: ({ agency: ctx, param, payload }) =>
				deleteServiceRequestCommand({
					...ctx,
					serviceRequestId: param('serviceRequestId'),
					acknowledgedAssignmentItemDeletion: acknowledged(
						payload.acknowledgedAssignmentItemDeletion,
					),
					// See the mission delete: whether the request was closed is its own
					// state, and nothing reads this yet.
					acknowledgedClosedRequestDeletion: acknowledged(
						payload.acknowledgedClosedRequestDeletion,
					),
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
				acknowledgedClosedRequestChange: acknowledged(payload.acknowledgedClosedRequestChange),
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
				acknowledgedHistoricalContactChange: acknowledged(
					payload.acknowledgedHistoricalContactChange,
				),
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
export async function writeServiceRequestCommand(
	trx: PublicEngagementTransaction,
	command: PublicEngagementCommand,
): Promise<ServiceRequestRow | null> {
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
): Promise<ServiceRequestRow> {
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
		.values(
			await checkedValues(trx, payload.organizationId, {
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
			}),
		)
		.returning(serviceRequestReturnColumns)
		.executeTakeFirstOrThrow();
	return row;
}

async function updateServiceRequestDetails(
	trx: PublicEngagementTransaction,
	payload: ServiceRequestPayload<'publicEngagement.updateServiceRequestDetails'>,
): Promise<ServiceRequestRow | null> {
	const { changes } = payload;
	await assertClosedRequestAcknowledged(trx, {
		serviceRequestId: payload.serviceRequestId,
		organizationId: payload.organizationId,
		acknowledgement: 'acknowledgedClosedRequestChange',
		acknowledged: payload.acknowledgedClosedRequestChange,
		message: 'This request is closed, and editing it changes what the resolution described.',
	});
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

/**
 * The work already dispatched against a service request.
 *
 * No table names a service request by column: everything that reaches one does
 * so through the polymorphic `entity_type`/`entity_id` pair, which is why this
 * asks the registry for one rule by key rather than taking its default. The
 * stops are the citation that matters. A technician sent to a stop was sent to
 * that address to see that person, and the stop keeps no copy of either, so
 * repointing the request afterwards rewrites what the visit was for. Comments
 * and tags are annotations on the request rather than work recorded under it.
 */
async function assertServiceRequestHistory(
	trx: PublicEngagementTransaction,
	payload: { readonly organizationId: string; readonly serviceRequestId: string },
	acknowledgement: 'acknowledgedHistoricalContactChange' | 'acknowledgedHistoricalLocationChange',
	acknowledgedValue: boolean,
): Promise<void> {
	await assertCitedHistoryAcknowledged(trx, {
		acknowledgement,
		recordType: 'serviceRequest',
		recordId: payload.serviceRequestId,
		organizationId: payload.organizationId,
		subject: 'service request',
		acknowledged: acknowledgedValue,
		relabels: true,
		only: ['serviceRequestAssignmentItems'],
	});
}

async function reassignServiceRequestContact(
	trx: PublicEngagementTransaction,
	payload: ServiceRequestPayload<'publicEngagement.updateServiceRequestContact'>,
): Promise<ServiceRequestRow | null> {
	await assertServiceRequestHistory(
		trx,
		payload,
		'acknowledgedHistoricalContactChange',
		payload.acknowledgedHistoricalContactChange,
	);
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
): Promise<ServiceRequestRow | null> {
	await assertServiceRequestHistory(
		trx,
		payload,
		'acknowledgedHistoricalLocationChange',
		payload.acknowledgedHistoricalLocationChange,
	);
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
): Promise<ServiceRequestRow | null> {
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
): Promise<ServiceRequestRow | null> {
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
): Promise<ServiceRequestRow | null> {
	await assertClosedRequestAcknowledged(trx, {
		serviceRequestId: payload.serviceRequestId,
		organizationId: payload.organizationId,
		acknowledgement: 'acknowledgedClosedRequestDeletion',
		acknowledged: payload.acknowledgedClosedRequestDeletion,
		message: 'This request is closed, so deleting it removes a resolved complaint from the record.',
	});
	await applyRecordDeletion(trx, {
		recordType: 'serviceRequest',
		recordId: payload.serviceRequestId,
		organizationId: payload.organizationId,
		actorProfileId: payload.actorProfileId,
		acknowledged: {
			acknowledgedAssignmentItemDeletion: payload.acknowledgedAssignmentItemDeletion,
		},
	});
	return softDelete(
		trx,
		'service_requests',
		payload.serviceRequestId,
		payload.organizationId,
		payload.actorProfileId,
		serviceRequestReturnColumns,
	);
}

/**
 * Refuse a write against a closed request whose confirmation was withheld.
 *
 * Closed is the request's own state, not a count of what hangs off it, so the
 * refusal carries no consequences and the message is the whole answer. Both
 * flags this serves ask the same question about the same column and differ only
 * in what the caller was about to do, which is why they are two flags and one
 * reader.
 */
async function assertClosedRequestAcknowledged(
	trx: PublicEngagementTransaction,
	input: {
		readonly serviceRequestId: string;
		readonly organizationId: string;
		readonly acknowledgement:
			| 'acknowledgedClosedRequestChange'
			| 'acknowledgedClosedRequestDeletion';
		readonly acknowledged: boolean;
		readonly message: string;
	},
): Promise<void> {
	if (input.acknowledged === true) {
		return;
	}
	const row = await trx
		.selectFrom('service_requests')
		.select('closed_at')
		.where('id', '=', input.serviceRequestId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	requireStateAcknowledgement({
		state: row?.closed_at != null,
		acknowledgement: input.acknowledgement,
		acknowledged: input.acknowledged,
		message: input.message,
	});
}

async function updateServiceRequest(
	trx: PublicEngagementTransaction,
	serviceRequestId: string,
	organizationId: string,
	set: Record<string, unknown>,
): Promise<ServiceRequestRow | null> {
	return updateRow(
		trx,
		'service_requests',
		serviceRequestId,
		organizationId,
		set,
		serviceRequestReturnColumns,
	);
}
