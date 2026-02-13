import type { SupabaseClient } from '@supabase/supabase-js';
import z, { type ZodObject } from 'zod';
import type { Database } from './database.types';

const MAX_INSERT_ROWS = 500;

type Table = keyof Database['public']['Tables'];

type InsertResult<T> = {
	data: T[] | null;
	count: number;
	error: Error | null;
};

export async function insert<
	TTable extends Table,
	TRowSchema extends ZodObject<z.ZodRawShape>,
	TInsertSchema extends ZodObject<z.ZodRawShape>,
>(
	table: TTable,
	rowSchema: TRowSchema,
	insertSchema: TInsertSchema,
	supabase: SupabaseClient<Database>,
	rows: Array<z.infer<TInsertSchema>>,
	options?: {
		signal?: AbortSignal;
	},
): Promise<InsertResult<z.infer<TRowSchema>>> {
	// 1. Check empty
	if (rows.length === 0) {
		return {
			data: null,
			count: 0,
			error: new Error('No rows provided for insert'),
		};
	}

	// 2. Check max
	if (rows.length > MAX_INSERT_ROWS) {
		return {
			data: null,
			count: 0,
			error: new Error(
				`Cannot insert more than ${MAX_INSERT_ROWS} rows at once`,
			),
		};
	}

	// 3. Validate insert schema
	const insertParser = z.array(insertSchema);
	const parsedData = insertParser.safeParse(rows);

	if (!parsedData.success) {
		return { data: null, count: 0, error: new Error('Invalid insert data') };
	}

	const fields = Object.keys(rowSchema.shape).join(',');

	let query = supabase
		.from(table)
		// biome-ignore lint/suspicious/noExplicitAny: <data can be any, since it's coming from the database and will be validated by the row schema>
		.insert(parsedData.data as any)
		.select(fields);

	if (options?.signal) {
		query = query.abortSignal(options.signal);
	}

	const { data, error } = await query;

	if (error) {
		return { data: null, count: 0, error: error as unknown as Error };
	}

	const rowParser = z.array(rowSchema);
	const parsedRows = rowParser.safeParse(data);

	if (!parsedRows.success) {
		return { data: null, count: 0, error: parsedRows.error };
	}

	return { data: parsedRows.data, count: parsedRows.data.length, error: null };
}
