import { ListEmpty } from '@simmer-mosquito/ui-web/components/page/list-states';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemTitle,
} from '@simmer-mosquito/ui-web/components/ui/item';
import { ArrowLeftIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { newRecordId } from '../../hooks/mutations/shared';
import { useContact } from '../../hooks/queries/use-contact-record';
import type { RegistrationListing } from '../../hooks/queries/use-registration-directory';
import { useBreadcrumbLabel } from '../app-shell';
import { MapSplitPage } from '../app-shell/outlet/map-split-page';
import { ToggleFilter } from '../explorer';
import { MapCanvas } from '../map';
import { WriteOnly } from '../write-only';
import { coverageFeatures } from './coverage-features';
import { RegistrationDraft } from './registration-draft';
import { useRegistrationRoster } from './use-registration-roster';

const RegistrationIcon = iconRegistry.entities.contact.icon;
/** Which registration the panel is working on: a new one, or one already saved. */
export type RegistrationDraftState =
	| { readonly kind: 'create'; readonly registrationId: string }
	| { readonly kind: 'edit'; readonly registrationId: string };

/**
 * Everywhere this contact asked to be warned before spraying.
 *
 * Reached from the contact rather than from a list of its own, because
 * `notification_registrations.contact_id` is `not null`: a registration is
 * always somebody's, and a standalone create page had to ask which somebody
 * before it could ask anything useful. Arriving from the contact answers that
 * before the form opens.
 *
 * Half map, because a registration is ground and what a reader checks is whether
 * it covers the right ground. The rings already recorded stay drawn while a new
 * one is being added, so a second registration overlapping the first shows while
 * it is being drawn rather than after it is saved.
 *
 * The panel is the running list, and adding swaps it for the form. One panel
 * rather than a dialog over the map, because the form draws on that map and a
 * modal would cover the surface its location control is asking to be clicked.
 */
export function ContactRegistrations({ contactId }: { readonly contactId: string }) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [includeInactive, setIncludeInactive] = useState(false);
	const [draft, setDraft] = useState<RegistrationDraftState | null>(null);
	/*
	 * Where the draft's draw toolbar is drawn. It belongs over the map and its
	 * controller belongs to the draft, so the draft portals into this rather than
	 * handing the controller up: `useMapDraw` returns a fresh object every render,
	 * and a parent that held it in state would re-render itself forever.
	 */
	const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);

	// The uuid otherwise stands in the trail where the contact's name belongs, the
	// way it does on every other by-id page.
	const { contact } = useContact(contactId);
	useBreadcrumbLabel(contactId, contact?.contactName ?? '');

	const roster = useRegistrationRoster(contactId, includeInactive);
	const coverage = useMemo(
		() => coverageFeatures(roster.registrations, roster.unitsById),
		[roster.registrations, roster.unitsById],
	);

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						controls={{ layers: false }}
						fitToData={coverage.features.length > 0}
						geoJson={coverage}
						onMapReady={setMap}
					/>
					<div className="pointer-events-none absolute inset-0" ref={setToolbarSlot} />
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className={stickyHeader({ surface: 'page' })}>
					<Link
						className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
						params={{ id: contactId }}
						to="/public-engagement/contacts/$id"
					>
						<ArrowLeftIcon aria-hidden="true" className="size-3.5" />
						Back to contact
					</Link>
					<div className="flex items-center justify-between gap-3">
						<h1 className="flex items-center gap-2 font-semibold text-foreground text-lg leading-tight">
							<RegistrationIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
							<span className="min-w-0 truncate">
								{draft === null ? 'Registrations' : draftTitle(draft)}
							</span>
						</h1>
						{draft === null ? (
							<ToggleFilter
								label="Include inactive"
								onChange={setIncludeInactive}
								value={includeInactive}
							/>
						) : null}
					</div>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto p-3">
					{draft === null ? (
						<RegistrationList
							onEdit={(registrationId) => setDraft({ kind: 'edit', registrationId })}
							registrations={roster.registrations}
							unitsById={roster.unitsById}
						/>
					) : (
						<RegistrationDraft
							contactId={contactId}
							draft={draft}
							// Keyed, so switching drafts remounts the form. Both
							// `useAppForm` and the location controller seed once, and a
							// reused instance would hold the previous registration's
							// values and its shape.
							key={draft.registrationId}
							map={map}
							onCancel={() => setDraft(null)}
							onSaved={(message) => {
								setDraft(null);
								toast.success(message);
							}}
							toolbarSlot={toolbarSlot}
						/>
					)}
				</div>

				{draft === null ? (
					<WriteOnly minimum="manager">
						<div className="shrink-0 border-border/40 border-t p-3">
							<Button
								className="w-full"
								onClick={() => setDraft({ kind: 'create', registrationId: newRecordId() })}
								size="sm"
							>
								Add registration
							</Button>
						</div>
					</WriteOnly>
				) : null}
			</div>
		</MapSplitPage>
	);
}

/** What this contact has recorded, or an invitation to record the first. */
function RegistrationList({
	onEdit,
	registrations,
	unitsById,
}: {
	readonly onEdit: (registrationId: string) => void;
	readonly registrations: readonly RegistrationListing[];
	readonly unitsById: ReadonlyMap<string, { readonly code: string }>;
}) {
	if (registrations.length === 0) {
		return (
			<ListEmpty
				description="Add one to record a place this contact asked to be warned about before spraying."
				icon={RegistrationIcon}
				title="No registrations yet"
			/>
		);
	}

	return (
		<ItemGroup>
			{registrations.map((registration) => (
				<RegistrationRow
					key={registration.id}
					onEdit={() => onEdit(registration.id)}
					registration={registration}
					unitsById={unitsById}
				/>
			))}
		</ItemGroup>
	);
}

function draftTitle(draft: RegistrationDraftState): string {
	return draft.kind === 'create' ? 'New registration' : 'Edit registration';
}

function RegistrationRow({
	onEdit,
	registration,
	unitsById,
}: {
	readonly onEdit: () => void;
	readonly registration: RegistrationListing;
	readonly unitsById: ReadonlyMap<string, { readonly code: string }>;
}) {
	return (
		<Item size="sm">
			<ItemContent className="min-w-0">
				<ItemTitle>{geometryLabel(registration.geomType)}</ItemTitle>
				<ItemDescription className="truncate">
					{coverageLabel(registration, unitsById)}
				</ItemDescription>
				<div className="mt-1 flex flex-wrap gap-1">
					{registration.isNoSpray ? <Badge variant="destructive">No spray</Badge> : null}
					{registration.hasBees ? <Badge variant="outline">Bees</Badge> : null}
					{registration.isActive ? null : <Badge variant="outline">Inactive</Badge>}
				</div>
			</ItemContent>
			<ItemActions>
				<WriteOnly minimum="manager">
					<Button onClick={onEdit} size="sm" variant="ghost">
						Edit
					</Button>
				</WriteOnly>
			</ItemActions>
		</Item>
	);
}

/** `500 ft around it`, or the shape alone where there is no buffer. */
function coverageLabel(
	registration: RegistrationListing,
	unitsById: ReadonlyMap<string, { readonly code: string }>,
): string {
	if (registration.bufferDistance === null || registration.bufferUnitId === null) {
		return 'The shape itself, with no buffer';
	}
	const code = unitsById.get(registration.bufferUnitId)?.code ?? 'unknown unit';
	return `${registration.bufferDistance} ${code} around it`;
}

function geometryLabel(geomType: string): string {
	switch (geomType.toLowerCase()) {
		case 'point':
			return 'Point';
		case 'linestring':
		case 'multilinestring':
			return 'Line';
		case 'polygon':
		case 'multipolygon':
			return 'Area';
		default:
			return 'Shape';
	}
}
