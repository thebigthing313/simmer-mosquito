// Vite resolves `?url` imports to the emitted (or inlined) asset URL at build
// time. These assets are small enough that Vite inlines them as data URIs, so
// no separate file needs to be served. Typed here because ui-web builds with
// tsgo (no `vite/client`), and its icon registry imports SVGs this way.
declare module '*.svg?url' {
	const url: string;
	export default url;
}
