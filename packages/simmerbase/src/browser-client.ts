import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export function createBrowserClient(supabaseKey: string, supabaseUrl: string) {
	return createClient<Database>(supabaseUrl, supabaseKey);
}
