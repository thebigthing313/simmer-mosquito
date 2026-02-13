import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import type { Database } from '../database.types';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	throw new Error(
		'Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_KEY in .env.local',
	);
}

/**
 * Creates a Supabase client using the service key (bypasses RLS).
 */
export function createTestClient(): SupabaseClient<Database> {
	return createClient<Database>(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);
}

/**
 * Generates a random UUID v4 for test data.
 */
export function randomUUID(): string {
	return crypto.randomUUID();
}

/**
 * Helper to clean up test data from a table by IDs.
 */
export async function cleanupByIds(
	supabase: SupabaseClient<Database>,
	table: string,
	ids: string[],
): Promise<void> {
	if (ids.length === 0) return;
	// biome-ignore lint/suspicious/noExplicitAny: test helper
    // @ts-expect-error: supabase query builder unable to infer type
	await (supabase.from(table) as any).delete().in('id', ids);
}
