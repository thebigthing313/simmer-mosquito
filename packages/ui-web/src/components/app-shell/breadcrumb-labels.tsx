import { createContext, useContext, useEffect, useState } from 'react';
import type { ShellCrumb } from './types';

/**
 * A small registry of human labels for path segments the breadcrumb trail would
 * otherwise render as opaque record ids. A detail route knows the friendly name
 * for its `$id` segment (e.g. a habitat's site name) but renders deep inside the
 * router `Outlet`, below the header that draws the trail — so it publishes the
 * label up here and {@link AppHeader} reads it back when building crumbs.
 *
 * The data (the map) and the API (the setters) live in separate contexts on
 * purpose: the API context value is created once and never changes identity, so a
 * route that only *registers* a label never re-renders when the map updates. That
 * keeps the publish path one-directional — registrars write, the header reads —
 * with no feedback loop between them.
 *
 * A page can also replace the whole trail with {@link useBreadcrumbTrail}. The
 * not-found page is the one that needs to: a path no route matched resolves to
 * no navigation item, and the trail built from it named whichever domain sorted
 * first, which is a location the reader was never in.
 */

/** Exported because {@link useBreadcrumbLabels} names it in its return type. */
export type BreadcrumbLabelMap = ReadonlyMap<string, string>;

interface LabelApi {
	readonly setLabel: (segment: string, label: string) => void;
	readonly clearLabel: (segment: string) => void;
	readonly setTrail: (trail: readonly ShellCrumb[] | null) => void;
}

const EMPTY_LABELS: BreadcrumbLabelMap = new Map();

const BreadcrumbLabelsContext = createContext<BreadcrumbLabelMap>(EMPTY_LABELS);
const BreadcrumbTrailContext = createContext<readonly ShellCrumb[] | null>(null);
const BreadcrumbLabelApiContext = createContext<LabelApi | null>(null);

export function BreadcrumbLabelProvider({ children }: { readonly children: React.ReactNode }) {
	const [labels, setLabels] = useState<BreadcrumbLabelMap>(EMPTY_LABELS);
	const [trail, setTrail] = useState<readonly ShellCrumb[] | null>(null);

	// The setters close over the state updater, never over `labels`, so nothing
	// here reads a value that changes between renders.
	const api: LabelApi = {
		setLabel: (segment, label) =>
			setLabels((current) =>
				current.get(segment) === label ? current : new Map(current).set(segment, label),
			),
		clearLabel: (segment) =>
			setLabels((current) => {
				if (!current.has(segment)) {
					return current;
				}
				const next = new Map(current);
				next.delete(segment);
				return next;
			}),
		setTrail,
	};

	return (
		<BreadcrumbLabelApiContext.Provider value={api}>
			<BreadcrumbLabelsContext.Provider value={labels}>
				<BreadcrumbTrailContext.Provider value={trail}>{children}</BreadcrumbTrailContext.Provider>
			</BreadcrumbLabelsContext.Provider>
		</BreadcrumbLabelApiContext.Provider>
	);
}

/** The current segment→label overrides, for {@link buildBreadcrumbs}. */
export function useBreadcrumbLabels(): BreadcrumbLabelMap {
	return useContext(BreadcrumbLabelsContext);
}

/** The trail a mounted page put in place of the resolved one, or null. */
export function useBreadcrumbTrailOverride(): readonly ShellCrumb[] | null {
	return useContext(BreadcrumbTrailContext);
}

/**
 * Register a friendly breadcrumb label for a path segment while this component is
 * mounted, clearing it on unmount so a stale name never outlives its route. A
 * no-op outside a {@link BreadcrumbLabelProvider} or until both values resolve.
 */
export function useBreadcrumbLabel(
	segment: string | null | undefined,
	label: string | null | undefined,
): void {
	const api = useContext(BreadcrumbLabelApiContext);

	useEffect(() => {
		if (
			api === null ||
			segment === null ||
			segment === undefined ||
			segment === '' ||
			label === null ||
			label === undefined ||
			label === ''
		) {
			return;
		}

		api.setLabel(segment, label);
		return () => api.clearLabel(segment);
	}, [api, segment, label]);
}

/**
 * Replace the whole breadcrumb trail while this component is mounted, and put
 * the resolved one back on unmount. Pass a stable array, a module constant or a
 * memoized value, because a new array on every render re-publishes on every
 * render.
 */
export function useBreadcrumbTrail(trail: readonly ShellCrumb[]): void {
	const api = useContext(BreadcrumbLabelApiContext);

	useEffect(() => {
		if (api === null) {
			return;
		}

		api.setTrail(trail);
		return () => api.setTrail(null);
	}, [api, trail]);
}
