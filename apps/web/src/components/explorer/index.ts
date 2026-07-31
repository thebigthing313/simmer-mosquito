/**
 * The shared chrome behind every explorer/map page: the filters above the list,
 * the rows in it, and the shape of a row's left rail.
 *
 * These started as one implementation on the inspections explorer and were
 * copy-pasted outward, which is how three of the nine pages ended up without
 * removable filter chips and none of them showed who did the work. Anything a
 * second explorer needs belongs here.
 */

export { ExplorerRow } from './explorer-row';
export { ActiveFilterBar, FilterChip } from './filter-chips';
export { type FilterOption, MultiSelectFilter, toggle } from './multi-select-filter';
export { RESULT_SKELETON_KEYS } from './result-skeleton';
export { useEntityTags } from './use-entity-tags';
export { usePersonnelOptions } from './use-personnel-options';
