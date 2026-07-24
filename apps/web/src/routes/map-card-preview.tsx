import type { AddressRow, RegionRow, ServiceRequestRow } from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';
import { getServerUrl } from '../auth';
import { useOrganizationWorkspace } from '../hooks/use-organization-workspace';
import { webCollections } from '../sync/webCollections';
import { HabitatMapCard } from './-habitat-map-card';
import { CollectionMapCard } from './adult-surveillance/-collection-map-card';
import { TrapMapCard } from './adult-surveillance/-trap-map-card';
import { ApplicationMapCard } from './control-operations/-application-map-card';
import { BiocontrolMapCard } from './control-operations/-biocontrol-map-card';
import { SourceReductionMapCard } from './control-operations/-source-reduction-map-card';
import { AddressMapCard } from './gis/addresses/-address-map-card';
import { RegionMapCard } from './gis/regions/-region-map-card';
import { InspectionMapCard } from './larval-surveillance/-inspection-map-card';
import { SampleMapCard } from './larval-surveillance/-sample-map-card';
import { ServiceRequestMapCard } from './public-engagement/-service-request-map-card';

/**
 * TEMPORARY design-review harness. Renders every `*MapCard` at once over a
 * simulated map surface, each self-fetching a real sample record so the cards
 * show live content. Not linked from the nav — reach it at `/map-card-preview`.
 * Safe to delete (this file only); nothing else imports it.
 */
export const Route = createFileRoute('/map-card-preview')({
	component: MapCardPreviewRoute,
});

const gcTimeMs = 30_000;
// west,south,east,north — the whole world, so the bbox-scoped list endpoints
// (habitats/inspections/samples) return their first row regardless of location.
const WORLD_BBOX = '-180,-90,180,90';

/** A `/map/*` list endpoint we can pull one sample id from. */
interface MapEndpoint {
	readonly key: string;
	readonly path: string;
	/** The array property on the JSON body holding the rows. */
	readonly field: string;
	/** Whether the endpoint requires a `bbox` query param. */
	readonly bbox?: boolean;
}

const ENDPOINTS = {
	habitats: { key: 'habitats', path: '/map/habitats', field: 'habitats', bbox: true },
	inspections: { key: 'inspections', path: '/map/inspections', field: 'inspections', bbox: true },
	samples: { key: 'samples', path: '/map/samples', field: 'samples', bbox: true },
	traps: { key: 'traps', path: '/map/traps', field: 'traps' },
	collections: { key: 'collections', path: '/map/collections', field: 'collections' },
	chemical: { key: 'chemical', path: '/map/chemical', field: 'applications' },
	sourceReduction: {
		key: 'source-reduction',
		path: '/map/source-reduction',
		field: 'sourceReductions',
	},
	biocontrol: { key: 'biocontrol', path: '/map/biocontrol', field: 'biocontrolActions' },
} as const satisfies Record<string, MapEndpoint>;

function MapCardPreviewRoute() {
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const organizationId = organization?.id ?? '';

	return (
		<div className="mx-auto w-full max-w-[1560px] px-4 py-6 md:px-8">
			<header className="mb-6 grid gap-1.5">
				<div className="flex flex-wrap items-center gap-2.5">
					<h1 className="m-0 font-semibold text-foreground text-xl leading-tight">
						Map focus cards
					</h1>
					<Badge tone="warning" variant="outline">
						Temporary preview
					</Badge>
				</div>
				<p className="m-0 max-w-[70ch] text-muted-foreground text-sm leading-relaxed">
					Every <code className="text-foreground text-xs">*MapCard</code> the explorers drop over a
					MapCanvas, shown together for a design pass. Each card self-fetches the first available
					record of its type, so the content is live — an empty type just shows a placeholder. The
					checkered panels stand in for the map the card floats over.
				</p>
			</header>

			<div className="grid grid-cols-1 gap-x-6 gap-y-8 lg:grid-cols-2 2xl:grid-cols-3">
				<HabitatStage />
				<InspectionStage />
				<SampleStage />
				<TrapStage />
				<CollectionStage />
				<ApplicationStage />
				<SourceReductionStage />
				<BiocontrolStage />
				<ServiceRequestStage organizationId={organizationId} />
				<AddressStage organizationId={organizationId} />
				<RegionStage organizationId={organizationId} />
			</div>
		</div>
	);
}

// --- id discovery -----------------------------------------------------------

function isRecordWithId(value: unknown): value is { readonly id: string } {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { readonly id?: unknown }).id === 'string'
	);
}

/** Fetches the id of the first row from a `/map/*` list endpoint (or `null`). */
function useFirstMapId(endpoint: MapEndpoint) {
	return useQuery({
		queryKey: ['map-card-preview', endpoint.key],
		queryFn: async ({ signal }) => {
			const url = new URL(endpoint.path, getServerUrl());
			url.searchParams.set('limit', '1');
			url.searchParams.set('offset', '0');
			if (endpoint.bbox === true) {
				url.searchParams.set('bbox', WORLD_BBOX);
			}
			const response = await fetch(url, { credentials: 'include', signal });
			if (!response.ok) {
				throw new Error(`${endpoint.path} failed (${response.status}).`);
			}
			const body = (await response.json()) as Record<string, unknown>;
			const rows = body[endpoint.field];
			const first = Array.isArray(rows) ? rows[0] : undefined;
			return isRecordWithId(first) ? first.id : null;
		},
	});
}

// --- stage framing ----------------------------------------------------------

// A muted graticule + soft vignette drawn from the `foreground` token via
// `currentColor` (see the overlay divs' `text-foreground/…`), so the map stand-in
// stays theme-aware and inside the palette instead of hard-coding grid colors.
const gridTextureStyle: CSSProperties = {
	backgroundImage:
		'repeating-linear-gradient(0deg, currentColor 0 1px, transparent 1px 44px), repeating-linear-gradient(90deg, currentColor 0 1px, transparent 1px 44px)',
};
const vignetteStyle: CSSProperties = {
	backgroundImage: 'radial-gradient(120% 80% at 50% 32%, transparent 45%, currentColor 100%)',
};

/** The map-like backdrop a single card floats over, with its label above. */
function MapStage({
	label,
	hint,
	children,
}: {
	readonly label: string;
	readonly hint: string;
	readonly children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-2">
			<div className="flex items-baseline justify-between gap-2">
				<h2 className="m-0 font-medium text-foreground text-sm">{label}</h2>
				<span className="truncate font-mono text-muted-foreground text-xs">{hint}</span>
			</div>
			<div className="relative h-[460px] overflow-hidden rounded-xl border border-border/60 bg-muted">
				<div
					aria-hidden="true"
					className="absolute inset-0 text-foreground/[0.07]"
					style={gridTextureStyle}
				/>
				<div
					aria-hidden="true"
					className="absolute inset-0 text-foreground/10"
					style={vignetteStyle}
				/>
				{/* The stand-in "selected feature" the card points at. */}
				<div aria-hidden="true" className="absolute inset-x-0 top-[34%] flex justify-center">
					<span className="relative flex size-3 items-center justify-center">
						<span className="absolute inline-flex size-7 rounded-full bg-primary/20" />
						<span className="relative inline-flex size-3 rounded-full bg-primary ring-2 ring-background" />
					</span>
				</div>
				{children}
			</div>
		</section>
	);
}

/** A card-slot placeholder (loading / empty / dismissed) positioned like the card. */
function StageNote({ children }: { readonly children: ReactNode }) {
	return (
		<div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center">
			<div className="pointer-events-auto rounded-lg border border-border/60 bg-card/95 px-4 py-3 text-center text-muted-foreground text-sm shadow-lg backdrop-blur-sm">
				{children}
			</div>
		</div>
	);
}

/** Wraps a card in a {@link MapStage}, adding a dismiss → "show again" toggle. */
function CardStage({
	label,
	hint,
	children,
}: {
	readonly label: string;
	readonly hint: string;
	readonly children: (close: () => void) => ReactNode;
}) {
	const [dismissed, setDismissed] = useState(false);
	return (
		<MapStage hint={hint} label={label}>
			{dismissed ? (
				<StageNote>
					<button
						className="rounded-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						onClick={() => setDismissed(false)}
						type="button"
					>
						Card dismissed — show again
					</button>
				</StageNote>
			) : (
				children(() => setDismissed(true))
			)}
		</MapStage>
	);
}

/** Resolves the loading / error / empty states down to the rendered card. */
function cardSlot(
	state: {
		readonly id: string | null | undefined;
		readonly isPending: boolean;
		readonly isError: boolean;
	},
	render: (id: string) => ReactNode,
): ReactNode {
	if (state.isPending) {
		return <StageNote>Loading a sample record…</StageNote>;
	}
	if (state.isError) {
		return <StageNote>Couldn't load a sample record.</StageNote>;
	}
	if (state.id == null) {
		return <StageNote>No records of this type in the workspace yet.</StageNote>;
	}
	return render(state.id);
}

// --- server-endpoint stages -------------------------------------------------

function HabitatStage() {
	const { data: id, isPending, isError } = useFirstMapId(ENDPOINTS.habitats);
	return (
		<CardStage hint="/habitats · /larval-surveillance/habitats" label="Habitat">
			{(close) =>
				cardSlot({ id, isPending, isError }, (resolved) => (
					<HabitatMapCard id={resolved} onClose={close} />
				))
			}
		</CardStage>
	);
}

function InspectionStage() {
	const { data: id, isPending, isError } = useFirstMapId(ENDPOINTS.inspections);
	return (
		<CardStage hint="/larval-surveillance/inspections" label="Inspection">
			{(close) =>
				cardSlot({ id, isPending, isError }, (resolved) => (
					<InspectionMapCard id={resolved} onClose={close} />
				))
			}
		</CardStage>
	);
}

function SampleStage() {
	const { data: id, isPending, isError } = useFirstMapId(ENDPOINTS.samples);
	return (
		<CardStage hint="/larval-surveillance/samples" label="Sample">
			{(close) =>
				cardSlot({ id, isPending, isError }, (resolved) => (
					<SampleMapCard id={resolved} onClose={close} />
				))
			}
		</CardStage>
	);
}

function TrapStage() {
	const { data: id, isPending, isError } = useFirstMapId(ENDPOINTS.traps);
	return (
		<CardStage hint="/adult-surveillance/traps" label="Trap">
			{(close) =>
				cardSlot({ id, isPending, isError }, (resolved) => (
					<TrapMapCard id={resolved} onClose={close} />
				))
			}
		</CardStage>
	);
}

function CollectionStage() {
	const { data: id, isPending, isError } = useFirstMapId(ENDPOINTS.collections);
	return (
		<CardStage hint="/adult-surveillance/collections" label="Collection">
			{(close) =>
				cardSlot({ id, isPending, isError }, (resolved) => (
					<CollectionMapCard id={resolved} onClose={close} />
				))
			}
		</CardStage>
	);
}

function ApplicationStage() {
	const { data: id, isPending, isError } = useFirstMapId(ENDPOINTS.chemical);
	return (
		<CardStage hint="/control-operations/chemical" label="Application (chemical)">
			{(close) =>
				cardSlot({ id, isPending, isError }, (resolved) => (
					<ApplicationMapCard id={resolved} onClose={close} />
				))
			}
		</CardStage>
	);
}

function SourceReductionStage() {
	const { data: id, isPending, isError } = useFirstMapId(ENDPOINTS.sourceReduction);
	return (
		<CardStage hint="/control-operations/source-reduction" label="Source reduction">
			{(close) =>
				cardSlot({ id, isPending, isError }, (resolved) => (
					<SourceReductionMapCard id={resolved} onClose={close} />
				))
			}
		</CardStage>
	);
}

function BiocontrolStage() {
	const { data: id, isPending, isError } = useFirstMapId(ENDPOINTS.biocontrol);
	return (
		<CardStage hint="/control-operations/biocontrol" label="Biocontrol">
			{(close) =>
				cardSlot({ id, isPending, isError }, (resolved) => (
					<BiocontrolMapCard id={resolved} onClose={close} />
				))
			}
		</CardStage>
	);
}

// --- on-demand collection stages (no /map/* list endpoint) ------------------

function ServiceRequestStage({ organizationId }: { readonly organizationId: string }) {
	const result = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ request: webCollections.serviceRequests })
					.where(({ request }) => eq(request.organizationId, organizationId))
					.orderBy(({ request }) => request.requestDate, 'desc'),
		},
		[organizationId],
	);
	const id = ((result.data ?? []) as readonly ServiceRequestRow[])[0]?.id ?? null;
	return (
		<CardStage hint="/public-engagement/service-requests" label="Service request">
			{(close) =>
				cardSlot({ id, isPending: !result.isReady, isError: false }, (resolved) => (
					<ServiceRequestMapCard id={resolved} onClose={close} />
				))
			}
		</CardStage>
	);
}

function AddressStage({ organizationId }: { readonly organizationId: string }) {
	const result = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ address: webCollections.addresses })
					.where(({ address }) => eq(address.organizationId, organizationId))
					.orderBy(({ address }) => address.displayName, 'asc'),
		},
		[organizationId],
	);
	const id = ((result.data ?? []) as readonly AddressRow[])[0]?.id ?? null;
	return (
		<CardStage hint="/gis/addresses" label="Address">
			{(close) =>
				cardSlot({ id, isPending: !result.isReady, isError: false }, (resolved) => (
					<AddressMapCard id={resolved} map={null} onClose={close} />
				))
			}
		</CardStage>
	);
}

function RegionStage({ organizationId }: { readonly organizationId: string }) {
	const result = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ region: webCollections.regions })
					.where(({ region }) => eq(region.organizationId, organizationId))
					.orderBy(({ region }) => region.name, 'asc'),
		},
		[organizationId],
	);
	const id = ((result.data ?? []) as readonly RegionRow[])[0]?.id ?? null;
	return (
		<CardStage hint="/gis/regions" label="Region">
			{(close) =>
				cardSlot({ id, isPending: !result.isReady, isError: false }, (resolved) => (
					<RegionMapCard id={resolved} map={null} onClose={close} />
				))
			}
		</CardStage>
	);
}
