/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

interface ImportMetaEnv {
	readonly VITE_MAPBOX_ACCESS_TOKEN: string;
	readonly VITE_SUPABASE_URL: string;
	readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
}

// biome-ignore lint/correctness/noUnusedVariables: <needed for Vite's import.meta typing>
interface ImportMeta {
	readonly env: ImportMetaEnv;
}
