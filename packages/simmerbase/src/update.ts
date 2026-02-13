import type { SupabaseClient } from '@supabase/supabase-js';
import z, { type ZodObject } from 'zod';
import type { Database } from './database.types';

type Table = keyof Database['public']['Tables'];

type UpdateResult<T> = {
	data: T[] | null;
	count: number;
	error: Error | null;
};

type SupabaseQuery<TTable extends Table> = ReturnType<
	SupabaseClient<Database>['from']
>[TTable]['update'];

export async function update<
	TTable extends Table,
	TRowSchema extends ZodObject<z.ZodRawShape>,
	TUpdateSchema extends ZodObject<z.ZodRawShape>,
>(
	table: TTable,
	rowSchema: TRowSchema,
	updateSchema: TUpdateSchema,
	supabase: SupabaseClient<Database>,
	row: z.infer<TUpdateSchema>,
	filter: (query: SupabaseQuery<TTable>) => SupabaseQuery<TTable>,
	options?: {
		signal?: AbortSignal;
	},
): Promise<UpdateResult<z.infer<TRowSchema>>> {
	// Guard against empty update body
	if (Object.keys(row).length === 0) {
		return {
			data: null,
			count: 0,
			error: new Error('No fields provided for update'),
		};
	}

	const rowValidation = updateSchema.safeParse(row);
	if (!rowValidation.success) {
		return { data: null, count: 0, error: rowValidation.error };
	}

	const fields = Object.keys(rowSchema.shape).join(',');

	let query = supabase
		.from(table)
		// biome-ignore lint/suspicious/noExplicitAny: <data can be any, since it's coming from the database and will be validated by the row schema>
		.update(rowValidation.data as any);

	query = filter(query);

	let selectQuery = query.select(fields);

	if (options?.signal) {
		selectQuery = selectQuery.abortSignal(options.signal);
	}

	const { data, error } = await selectQuery;
	if (error) {
		return { data: null, count: 0, error: error as unknown as Error };
	}

	const rowParser = z.array(rowSchema);
	const parsedRows = rowParser.safeParse(data);

	if (!parsedRows.success) {
		return { data: null, count: 0, error: parsedRows.error };
	} else {
		return {
			data: parsedRows.data,
			count: parsedRows.data.length,
			error: null,
		};
	}
}
