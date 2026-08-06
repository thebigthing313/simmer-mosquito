/**
 * The shell, as this app's routes reach it.
 *
 * The chrome itself now lives in `@simmer-mosquito/ui-web/components/app-shell`
 * so the operator console can wear it too. What stays here is web's own wiring:
 * the domain model in `navigation.ts`, the data binding in `app-shell-root.tsx`,
 * and the map-bearing outlet layouts, which depend on `components/map`.
 *
 * Re-exported rather than re-pointed at every call site — these two are imported
 * from ~20 route files, and where the chrome is packaged is an implementation
 * detail of the shell rather than something each route should have to know.
 */
export {
	OutletSimpleLayout,
	useBreadcrumbLabel,
} from '@simmer-mosquito/ui-web/components/app-shell';
