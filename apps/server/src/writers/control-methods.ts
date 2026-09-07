import { assertRecordDeletable, type DeletableRecordType, sql } from '@simmer-mosquito/db';
import type {
	CreateApplicationMethodCommand,
	CreateBiocontrolMethodCommand,
	CreateOutreachMethodCommand,
	CreateSourceReductionMethodCommand,
	DeactivateApplicationMethodCommand,
	DeactivateBiocontrolMethodCommand,
	DeactivateOutreachMethodCommand,
	DeactivateSourceReductionMethodCommand,
	DeleteApplicationMethodCommand,
	DeleteBiocontrolMethodCommand,
	DeleteOutreachMethodCommand,
	DeleteSourceReductionMethodCommand,
	ReactivateApplicationMethodCommand,
	ReactivateBiocontrolMethodCommand,
	ReactivateOutreachMethodCommand,
	ReactivateSourceReductionMethodCommand,
	UpdateApplicationMethodCommand,
	UpdateBiocontrolMethodCommand,
	UpdateOutreachMethodCommand,
	UpdateSourceReductionMethodCommand,
} from '@simmer-mosquito/domain';
import type { CommandTransaction } from '../command-write.js';
import { assertCitedHistoryAcknowledged } from '../record-history.js';
import { type CommandRow, returnColumns } from '../return-columns.js';

type ControlMethodTransaction = CommandTransaction;

type ApplicationMethodCommand =
	| CreateApplicationMethodCommand
	| UpdateApplicationMethodCommand
	| DeactivateApplicationMethodCommand
	| ReactivateApplicationMethodCommand
	| DeleteApplicationMethodCommand;
type SourceReductionMethodCommand =
	| CreateSourceReductionMethodCommand
	| UpdateSourceReductionMethodCommand
	| DeactivateSourceReductionMethodCommand
	| ReactivateSourceReductionMethodCommand
	| DeleteSourceReductionMethodCommand;
type OutreachMethodCommand =
	| CreateOutreachMethodCommand
	| UpdateOutreachMethodCommand
	| DeactivateOutreachMethodCommand
	| ReactivateOutreachMethodCommand
	| DeleteOutreachMethodCommand;
type BiocontrolMethodCommand =
	| CreateBiocontrolMethodCommand
	| UpdateBiocontrolMethodCommand
	| DeactivateBiocontrolMethodCommand
	| ReactivateBiocontrolMethodCommand
	| DeleteBiocontrolMethodCommand;
export type ControlMethodCommand =
	| ApplicationMethodCommand
	| SourceReductionMethodCommand
	| OutreachMethodCommand
	| BiocontrolMethodCommand;

/**
 * The four method catalogs share one rename question, so they share one call.
 *
 * Nothing snapshots a method's name onto the actions performed with it, so a
 * rename relabels every one of them. The custom schema is not what a past
 * action is read back under, so editing it alone asks nothing.
 */
async function assertMethodRename(
	db: ControlMethodTransaction,
	recordType: DeletableRecordType,
	subject: string,
	recordId: string,
	payload: {
		readonly organizationId: string;
		readonly changes: { readonly name?: string };
		readonly acknowledgedHistoricalLabelChange: boolean;
	},
): Promise<void> {
	await assertCitedHistoryAcknowledged(db, {
		recordType,
		subject,
		recordId,
		organizationId: payload.organizationId,
		acknowledgement: 'acknowledgedHistoricalLabelChange',
		acknowledged: payload.acknowledgedHistoricalLabelChange,
		relabels: payload.changes.name !== undefined,
	});
}

export async function writeControlMethodCommand(
	db: ControlMethodTransaction,
	command: ControlMethodCommand,
): Promise<ControlMethodRow | null> {
	switch (command.type) {
		case 'controlOperations.createApplicationMethod':
			return createControlMethod(db, 'application_methods', {
				id: command.payload.applicationMethodId,
				organizationId: command.payload.organizationId,
				name: command.payload.name,
				customSchema: command.payload.customSchema,
				isActive: true,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.updateApplicationMethod':
			await assertMethodRename(
				db,
				'applicationMethod',
				'application method',
				command.payload.applicationMethodId,
				command.payload,
			);
			return updateControlMethod(db, 'application_methods', command.payload.applicationMethodId, {
				organizationId: command.payload.organizationId,
				...command.payload.changes,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.deactivateApplicationMethod':
			return setControlMethodActive(
				db,
				'application_methods',
				command.payload.applicationMethodId,
				{
					organizationId: command.payload.organizationId,
					actorProfileId: command.payload.actorProfileId,
					isActive: false,
				},
			);
		case 'controlOperations.reactivateApplicationMethod':
			return setControlMethodActive(
				db,
				'application_methods',
				command.payload.applicationMethodId,
				{
					organizationId: command.payload.organizationId,
					actorProfileId: command.payload.actorProfileId,
					isActive: true,
				},
			);
		case 'controlOperations.deleteApplicationMethod':
			return deleteControlMethod(db, 'application_methods', command.payload.applicationMethodId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.createSourceReductionMethod':
			return createControlMethod(db, 'source_reduction_methods', {
				id: command.payload.sourceReductionMethodId,
				organizationId: command.payload.organizationId,
				name: command.payload.name,
				customSchema: command.payload.customSchema,
				isActive: true,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.updateSourceReductionMethod':
			await assertMethodRename(
				db,
				'sourceReductionMethod',
				'source reduction method',
				command.payload.sourceReductionMethodId,
				command.payload,
			);
			return updateControlMethod(
				db,
				'source_reduction_methods',
				command.payload.sourceReductionMethodId,
				{
					organizationId: command.payload.organizationId,
					...command.payload.changes,
					actorProfileId: command.payload.actorProfileId,
				},
			);
		case 'controlOperations.deactivateSourceReductionMethod':
			return setControlMethodActive(
				db,
				'source_reduction_methods',
				command.payload.sourceReductionMethodId,
				{
					organizationId: command.payload.organizationId,
					actorProfileId: command.payload.actorProfileId,
					isActive: false,
				},
			);
		case 'controlOperations.reactivateSourceReductionMethod':
			return setControlMethodActive(
				db,
				'source_reduction_methods',
				command.payload.sourceReductionMethodId,
				{
					organizationId: command.payload.organizationId,
					actorProfileId: command.payload.actorProfileId,
					isActive: true,
				},
			);
		case 'controlOperations.deleteSourceReductionMethod':
			return deleteControlMethod(
				db,
				'source_reduction_methods',
				command.payload.sourceReductionMethodId,
				{
					organizationId: command.payload.organizationId,
					actorProfileId: command.payload.actorProfileId,
				},
			);
		case 'controlOperations.createOutreachMethod':
			return createControlMethod(db, 'outreach_methods', {
				id: command.payload.outreachMethodId,
				organizationId: command.payload.organizationId,
				name: command.payload.name,
				customSchema: command.payload.customSchema,
				isActive: true,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.updateOutreachMethod':
			await assertMethodRename(
				db,
				'outreachMethod',
				'outreach method',
				command.payload.outreachMethodId,
				command.payload,
			);
			return updateControlMethod(db, 'outreach_methods', command.payload.outreachMethodId, {
				organizationId: command.payload.organizationId,
				...command.payload.changes,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.deactivateOutreachMethod':
			return setControlMethodActive(db, 'outreach_methods', command.payload.outreachMethodId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				isActive: false,
			});
		case 'controlOperations.reactivateOutreachMethod':
			return setControlMethodActive(db, 'outreach_methods', command.payload.outreachMethodId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				isActive: true,
			});
		case 'controlOperations.deleteOutreachMethod':
			return deleteControlMethod(db, 'outreach_methods', command.payload.outreachMethodId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.createBiocontrolMethod':
			return createControlMethod(db, 'biocontrol_methods', {
				id: command.payload.biocontrolMethodId,
				organizationId: command.payload.organizationId,
				name: command.payload.name,
				customSchema: command.payload.customSchema,
				isActive: true,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.updateBiocontrolMethod':
			await assertMethodRename(
				db,
				'biocontrolMethod',
				'biocontrol method',
				command.payload.biocontrolMethodId,
				command.payload,
			);
			return updateControlMethod(db, 'biocontrol_methods', command.payload.biocontrolMethodId, {
				organizationId: command.payload.organizationId,
				...command.payload.changes,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.deactivateBiocontrolMethod':
			return setControlMethodActive(db, 'biocontrol_methods', command.payload.biocontrolMethodId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				isActive: false,
			});
		case 'controlOperations.reactivateBiocontrolMethod':
			return setControlMethodActive(db, 'biocontrol_methods', command.payload.biocontrolMethodId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				isActive: true,
			});
		case 'controlOperations.deleteBiocontrolMethod':
			return deleteControlMethod(db, 'biocontrol_methods', command.payload.biocontrolMethodId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
	}
}

/**
 * What a control method answers with.
 *
 * The four method tables declare the same nine fields, so one row type covers
 * all of them. Each write still reads `returnColumns[table]` off the table it is
 * writing rather than naming `application_methods` for all four, so a column
 * added to one of them is a type error here instead of three catalogs quietly
 * answering short. `return-columns.test.ts` asserts the four agree as well,
 * which is what says why one row type is enough.
 */
type ControlMethodRow = CommandRow<'application_methods'>;

type ControlMethodTableName =
	| 'application_methods'
	| 'source_reduction_methods'
	| 'outreach_methods'
	| 'biocontrol_methods';

interface ControlMethodWriteInput {
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly customSchema: unknown | null;
	readonly isActive: boolean;
	readonly actorProfileId: string;
}

interface ControlMethodUpdateInput {
	readonly organizationId: string;
	readonly name?: string;
	readonly customSchema?: unknown | null;
	readonly actorProfileId: string;
}

interface ControlMethodLifecycleInput {
	readonly organizationId: string;
	readonly actorProfileId: string;
}

async function createControlMethod(
	db: ControlMethodTransaction,
	table: ControlMethodTableName,
	input: ControlMethodWriteInput,
): Promise<ControlMethodRow> {
	const row = await db
		.insertInto(table)
		.values({
			id: input.id,
			organization_id: input.organizationId,
			name: input.name,
			custom_schema: input.customSchema,
			is_active: input.isActive,
			created_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
		})
		.returning(returnColumns[table])
		.executeTakeFirstOrThrow();

	return row;
}

async function updateControlMethod(
	db: ControlMethodTransaction,
	table: ControlMethodTableName,
	methodId: string,
	input: ControlMethodUpdateInput,
): Promise<ControlMethodRow | null> {
	const row = await db
		.updateTable(table)
		.set({
			...(input.name === undefined ? {} : { name: input.name }),
			...(input.customSchema === undefined ? {} : { custom_schema: input.customSchema }),
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', methodId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(returnColumns[table])
		.executeTakeFirst();

	return row ?? null;
}

async function setControlMethodActive(
	db: ControlMethodTransaction,
	table: ControlMethodTableName,
	methodId: string,
	input: ControlMethodLifecycleInput & { readonly isActive: boolean },
): Promise<ControlMethodRow | null> {
	const row = await db
		.updateTable(table)
		.set({
			is_active: input.isActive,
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', methodId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(returnColumns[table])
		.executeTakeFirst();

	return row ?? null;
}

/**
 * The four method catalogs are one writer, so the delete guard needs the
 * record type its table answers to. A `Record` over the table union rather
 * than a lookup that can miss: a fifth method catalog will not compile until
 * it names its type here.
 */
const CONTROL_METHOD_RECORD_TYPES: Record<ControlMethodTableName, DeletableRecordType> = {
	application_methods: 'applicationMethod',
	source_reduction_methods: 'sourceReductionMethod',
	outreach_methods: 'outreachMethod',
	biocontrol_methods: 'biocontrolMethod',
};

async function deleteControlMethod(
	db: ControlMethodTransaction,
	table: ControlMethodTableName,
	methodId: string,
	input: ControlMethodLifecycleInput,
): Promise<ControlMethodRow | null> {
	await assertRecordDeletable(db, {
		recordType: CONTROL_METHOD_RECORD_TYPES[table],
		recordId: methodId,
		organizationId: input.organizationId,
	});

	const row = await db
		.updateTable(table)
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', methodId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(returnColumns[table])
		.executeTakeFirst();

	return row ?? null;
}
