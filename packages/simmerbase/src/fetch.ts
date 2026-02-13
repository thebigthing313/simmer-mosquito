import type { SupabaseClient } from '@supabase/supabase-js';
import z, { type ZodObject } from 'zod';
import type { Database } from './database.types';

type Table = keyof Database['public']['Tables'];
type Column<TTable extends Table> =
	keyof Database['public']['Tables'][TTable]['Row'] & string;

type FetchResult<T> = {
	data: T[] | null;
	error: Error | null;
};

type SupabaseQuery<TTable extends Table> = ReturnType<
	SupabaseClient<Database>['from']
>[TTable]['select'];

interface PaginationOptions<TTable extends Table> {
	column: Column<TTable>;
	ascending?: boolean;
	from: number;
	to: number;
}

export async function fetch<
	TTable extends Table,
	TSchema extends ZodObject<z.ZodRawShape>,
>(
	table: TTable,
	schema: TSchema,
	supabase: SupabaseClient<Database>,
	options?: {
		filter?: (query: SupabaseQuery<TTable>) => SupabaseQuery<TTable>;
		pagination?: PaginationOptions<TTable>;
		signal?: AbortSignal;
	},
): Promise<FetchResult<z.infer<TSchema>>> {
	const fields = Object.keys(schema.shape).join(',');

	let query = supabase.from(table).select(fields);

	if (options?.filter) {
		query = options.filter(query);
	}

	if (options?.signal) {
		query = query.abortSignal(options.signal);
	}

	if (options?.pagination) {
		const { column, ascending = true, from, to } = options.pagination;
		query = query.order(column, { ascending }).range(from, to);
	}

	const { data, error } = await query;
	if (error) {
		return { data: null, error: error as unknown as Error };
	}

	const parser = z.array(schema);
	const parsedData = parser.safeParse(data);

	if (!parsedData.success) {
		return { data: null, error: parsedData.error };
	} else {
		return { data: parsedData.data, error: null };
	}
}
