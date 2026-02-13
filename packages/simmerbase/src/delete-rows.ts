import type { PostgrestFilterBuilder } from '@supabase/postgrest-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

type DeleteResult =
	| { success: true; error: null; count: number }
	| { success: false; error: Error; count: 0 };

type Table = keyof Database['public']['Tables'];
type Row<T extends Table> = Database['public']['Tables'][T]['Row'];

type DeleteFilter<T extends Table> = PostgrestFilterBuilder<
	// biome-ignore lint/suspicious/noExplicitAny: Required for generic to work
	any,
	Database['public'],
	Row<T>,
	null
>;

export async function deleteRows<TTable extends Table>(
	table: TTable,
	supabase: SupabaseClient<Database>,
	filter: (query: DeleteFilter<TTable>) => DeleteFilter<TTable>,
	options?: {
		signal?: AbortSignal;
	},
): Promise<DeleteResult> {
	const query = supabase.from(table).delete({ count: 'exact' });

	// biome-ignore lint/suspicious/noExplicitAny: Required to bridge the builder overload
	let filteredQuery = filter(query as any);

	if (options?.signal) {
		filteredQuery = filteredQuery.abortSignal(
			options.signal,
		) as DeleteFilter<TTable>;
	}

	const { error, count } = await filteredQuery;

	if (error) {
		return { success: false, error: error as unknown as Error, count: 0 };
	}

	return { success: true, error: null, count: count ?? 0 };
}
