import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemTitle,
} from '@simmer-mosquito/ui-web/components/ui/item';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { newRecordId } from '../../hooks/mutations/shared';
import { useContact } from '../../hooks/queries/use-contact-record';
import type { RegistrationListing } from '../../hooks/queries/use-registration-directory';
import { useBreadcrumbLabel } from '../app-shell';
import { ExplorerMapPage, ToggleFilter, useExplorerPanel } from '../explorer';
import { MapCanvas } from '../map';
import { WriteOnly } from '../write-only';
import { coverageFeatures } from './coverage-features';
import { RegistrationDraft } from './registration-draft';
import { useRegistrationRoster } from './use-registration-roster';

const RegistrationIcon = iconRegistry.entities.contact.icon;
const RESULT_NOUN = { one: 'registration', many: 'registrations' } as const;

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
	const panel = useExplorerPanel();
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
		<ExplorerMapPage
			activeFilterCount={includeInactive ? 1 : 0}
			filters={
				<ToggleFilter
					label="Include inactive"
					onChange={setIncludeInactive}
					value={includeInactive}
				/>
			}
			footer={
				draft === null ? (
					<WriteOnly minimum="manager">
						<Button
							className="w-full"
							onClick={() => setDraft({ kind: 'create', registrationId: newRecordId() })}
							size="sm"
						>
							Add registration
						</Button>
					</WriteOnly>
				) : undefined
			}
			heading={{
				title: draft === null ? 'Registrations' : draftTitle(draft),
				icon: RegistrationIcon,
				total: roster.registrations.length,
				isLoading: !roster.isReady,
				noun: RESULT_NOUN,
			}}
			map={
				<>
					<MapCanvas
						controls={{ layers: false }}
						fitToData={coverage.features.length > 0}
						geoJson={coverage}
						inset={panel.inset}
						onMapReady={setMap}
						searchWidth={panel.width}
					/>
					<div className="pointer-events-none absolute inset-0" ref={setToolbarSlot} />
				</>
			}
			onResetFilters={() => setIncludeInactive(false)}
			panel={panel}
			results={
				draft === null
					? {
							rows: roster.registrations,
							emptyTitle: 'No registrations yet',
							emptyDescription:
								'Add one to record a place this contact asked to be warned about before spraying.',
							renderRow: (registration) => (
								<RegistrationRow
									key={registration.id}
									onEdit={() => setDraft({ kind: 'edit', registrationId: registration.id })}
									registration={registration}
									unitsById={roster.unitsById}
								/>
							),
						}
					: {
							isEmpty: false,
							emptyTitle: '',
							emptyDescription: '',
							body: (
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
							),
						}
			}
		/>
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
