/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_MAPBOX_ACCESS_TOKEN: string;
	readonly VITE_SUPABASE_URL: string;
	readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
