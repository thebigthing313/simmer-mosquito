import { convertUnitAmount } from '@simmer-mosquito/domain';
import { circlePolygon } from '@simmer-mosquito/mapping';
import { SearchField } from '@simmer-mosquito/ui-web/components/search-field';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import {
	ActiveFilterBar,
	ExplorerMapPage,
	ExplorerRow,
	FilterChip,
	ToggleFilter,
	useExplorerPanel,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { MapCanvas } from '../../../components/map';
import { useContactDirectory } from '../../../hooks/queries/use-contact-directory';
import {
	type RegistrationListing,
	useRegistrationDirectory,
} from '../../../hooks/queries/use-registration-directory';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import {
	type FilterCodecs,
	flagParam,
	searchValidator,
	textParam,
	useDebouncedTextFilter,
	useSearchFilters,
} from '../../../lib/search-filters';

interface RegistrationFilters {
	readonly search: string;
	readonly noSprayOnly: boolean;
	readonly includeInactive: boolean;
}

const FILTER_DEFAULTS: RegistrationFilters = {
	search: '',
	noSprayOnly: false,
	includeInactive: false,
};
const FILTER_CODECS: FilterCodecs<RegistrationFilters> = {
	search: textParam,
	noSprayOnly: flagParam,
	includeInactive: flagParam,
};

export const Route = createFileRoute('/public-engagement/registrations/')({
	component: RegistrationsExplorerRoute,
	validateSearch: searchValidator(FILTER_CODECS),
});

const RegistrationIcon = iconRegistry.entities.contact.icon;
const RESULT_NOUN = { one: 'registration', many: 'registrations' };
const PAGE_SIZE = 25;

/**
 * Every place the agency has been asked to warn before spraying.
 *
 * The map draws the buffer, not a pin. A registration is a catchment, and the
 * radius is what generation measures against, so a map that drew each one as a
 * dot would show the operator none of the thing they are looking at: two
 * registrations a street apart with a mile of buffer overlap the whole
 * neighbourhood, and that is the fact worth seeing before a mission is planned.
 *
 * A registration with no buffer draws as its own shape, which is the honest
 * picture of what it covers.
 */
function RegistrationsExplorerRoute() {
	const { registrations, isReady } = useRegistrationDirectory();
	const { contacts } = useContactDirectory();
	const { byId: unitsById } = useUnitLabels();
	const panel = useExplorerPanel();

	const { filters, setFilters, reset, activeCount } = useSearchFilters(
		FILTER_DEFAULTS,
		FILTER_CODECS,
	);
	const searchInput = useDebouncedTextFilter(filters.search, (next) =>
		setFilters({ search: next }),
	);
	const search = filters.search;

	const [page, setPage] = useState(0);
	const [focusedId, setFocusedId] = useState<string | null>(null);

	const contactNameById = useMemo(
		() => new Map(contacts.map((contact) => [contact.id, contact.contactName ?? ''])),
		[contacts],
	);

	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		return registrations.filter((registration) => {
			if (!filters.includeInactive && !registration.isActive) {
				return false;
			}
			if (filters.noSprayOnly && !registration.isNoSpray) {
				return false;
			}
			if (query.length === 0) {
				return true;
			}
			return (contactNameById.get(registration.contactId) ?? '').toLowerCase().includes(query);
		});
	}, [contactNameById, filters.includeInactive, filters.noSprayOnly, registrations, search]);

	const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	const visible = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

	const coverage = useMemo(() => coverageFeatures(filtered, unitsById), [filtered, unitsById]);

	return (
		<ExplorerMapPage
			filters={
				<RegistrationFilterPanel
					activeCount={activeCount}
					filters={filters}
					onReset={reset}
					search={searchInput}
					setFilters={setFilters}
				/>
			}
			footer={
				pageCount > 1 ? (
					<ExplorerPagination
						noun={RESULT_NOUN}
						onPageChange={setPage}
						page={page}
						pageCount={pageCount}
						total={filtered.length}
					/>
				) : undefined
			}
			heading={{
				title: 'Notification Registrations',
				icon: RegistrationIcon,
				total: filtered.length,
				isLoading: !isReady,
				noun: RESULT_NOUN,
				create: {
					to: '/public-engagement/registrations/create',
					label: 'Create Registration',
				},
			}}
			map={
				<MapCanvas
					controls={{ layers: false, measure: true, readout: true }}
					fitToData
					geoJson={coverage}
					geoJsonInteraction={{
						selectedId: focusedId,
						onSelectFeature: (id: string | null) => setFocusedId(id),
					}}
					inset={panel.inset}
					searchWidth={panel.width}
				/>
			}
			activeFilterCount={activeCount}
			onResetFilters={reset}
			panel={panel}
			results={{
				rows: visible,
				emptyTitle: activeCount > 0 ? 'No registrations match' : 'No registrations yet',
				emptyDescription:
					activeCount > 0
						? 'Try a different search term, or include inactive registrations.'
						: 'Record a place to warn before spraying, and generation will find it.',
				renderRow: (registration) => (
					<RegistrationRowItem
						contactName={contactNameById.get(registration.contactId) ?? ''}
						isFocused={registration.id === focusedId}
						key={registration.id}
						onFocus={() => setFocusedId(registration.id)}
						registration={registration}
						unitAbbreviation={
							registration.bufferUnitId === null
								? null
								: (unitsById.get(registration.bufferUnitId)?.abbreviation ?? null)
						}
					/>
				),
			}}
		/>
	);
}

/**
 * The three questions worth narrowing this list by.
 *
 * Separate from the page because the page is already a map, a list and a
 * generation of buffer rings, and the filter rail is the part of it that has
 * nothing to do with any of those.
 */
function RegistrationFilterPanel({
	activeCount,
	filters,
	onReset,
	search,
	setFilters,
}: {
	readonly activeCount: number;
	readonly filters: RegistrationFilters;
	readonly onReset: () => void;
	readonly search: {
		readonly input: string;
		readonly setInput: (next: string) => void;
		readonly clear: () => void;
	};
	readonly setFilters: (patch: Partial<RegistrationFilters>) => void;
}) {
	return (
		<>
			<SearchField
				label="Search registrations"
				onChange={search.setInput}
				onClear={search.clear}
				placeholder="Search by contact"
				value={search.input}
			/>
			<ToggleFilter
				label="No-spray only"
				onChange={(next) => setFilters({ noSprayOnly: next })}
				value={filters.noSprayOnly}
			/>
			<ToggleFilter
				label="Include inactive"
				onChange={(next) => setFilters({ includeInactive: next })}
				value={filters.includeInactive}
			/>

			{activeCount === 0 ? null : (
				<ActiveFilterBar onClearAll={onReset}>
					{filters.search.trim().length === 0 ? null : (
						<FilterChip label={`Search: ${filters.search}`} onRemove={search.clear} />
					)}
					{filters.noSprayOnly ? (
						<FilterChip label="No-spray only" onRemove={() => setFilters({ noSprayOnly: false })} />
					) : null}
					{filters.includeInactive ? (
						<FilterChip
							label="Including inactive"
							onRemove={() => setFilters({ includeInactive: false })}
						/>
					) : null}
				</ActiveFilterBar>
			)}
		</>
	);
}

function RegistrationRowItem({
	contactName,
	isFocused,
	onFocus,
	registration,
	unitAbbreviation,
}: {
	readonly contactName: string;
	readonly isFocused: boolean;
	readonly onFocus: () => void;
	readonly registration: RegistrationListing;
	readonly unitAbbreviation: string | null;
}) {
	const name = contactName.trim() === '' ? 'Unnamed contact' : contactName;
	const marks = [
		registration.isNoSpray ? 'Do not spray' : null,
		registration.hasBees ? 'Bees' : null,
		registration.isActive ? null : 'Inactive',
		registration.bufferDistance === null || unitAbbreviation === null
			? 'Exact shape'
			: `${registration.bufferDistance} ${unitAbbreviation} buffer`,
	].filter((mark): mark is string => mark !== null);

	return (
		<ExplorerRow
			detailLabel={`View details for ${name}`}
			detailLink={{ to: '/public-engagement/registrations/$id', params: { id: registration.id } }}
			isSelected={isFocused}
			onSelect={onFocus}
			selectLabel={`Show ${name} on the map`}
			subtitle={marks.join(' · ')}
			title={name}
			titleLink={{ to: '/public-engagement/registrations/$id', params: { id: registration.id } }}
		/>
	);
}

/**
 * What each registration actually covers, as a shape the map can draw.
 *
 * The buffer is converted here rather than server-side because the conversion
 * table lives in `packages/domain` and is keyed by unit code, which the client
 * already has. A unit the table cannot price draws as the bare centre point
 * rather than as a circle of the wrong size: generation refuses that unit
 * outright, so drawing a confident ring around it would show coverage nobody is
 * going to be notified inside of.
 */
function coverageFeatures(
	registrations: readonly RegistrationListing[],
	unitsById: ReadonlyMap<string, { readonly code: string }>,
): GeoJSON.FeatureCollection {
	return {
		type: 'FeatureCollection',
		features: registrations.map((registration) => {
			const metres = bufferMetres(registration, unitsById);
			const properties = {
				id: registration.id,
				isNoSpray: registration.isNoSpray,
				hasBees: registration.hasBees,
				isActive: registration.isActive,
			};
			return metres === null
				? {
						type: 'Feature' as const,
						id: registration.id,
						properties,
						geometry: {
							type: 'Point' as const,
							coordinates: [registration.lng, registration.lat],
						},
					}
				: {
						type: 'Feature' as const,
						id: registration.id,
						properties,
						geometry: circlePolygon(
							{ lng: registration.lng, lat: registration.lat },
							metres,
						) as unknown as GeoJSON.Polygon,
					};
		}),
	};
}

function bufferMetres(
	registration: RegistrationListing,
	unitsById: ReadonlyMap<string, { readonly code: string }>,
): number | null {
	if (registration.bufferDistance === null || registration.bufferUnitId === null) {
		return null;
	}
	const code = unitsById.get(registration.bufferUnitId)?.code;
	if (code === undefined) {
		return null;
	}
	const metres = convertUnitAmount(registration.bufferDistance, code, 'meter');
	return metres === null || metres <= 0 ? null : metres;
}
