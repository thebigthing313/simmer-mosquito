import {
	ALL_METHODS,
	type DirectoryFilters,
	type TrapDirectory,
} from '../../routes/adult-surveillance/-trap-directory-data';
import { trapDisplayName } from '../queries/trap-view';
import { useActiveTraps } from '../queries/use-active-traps';

/**
 * Which of the standing inventory the filters leave on screen.
 *
 * The inventory itself arrives sorted and with its method names joined
 * ({@link useActiveTraps}), off an eager shape, so the list resolves without a
 * fetch — only the selected trap's collections are on-demand, which is what makes
 * the selection rule below worth stating carefully.
 */
/**
 * The method tabs, in label order.
 *
 * A method only gets a tab if an active trap actually uses it. An organization
 * that has never run a gravid trap should not be offered an empty gravid tab,
 * which is why the tabs are built from the traps rather than from the catalog.
 */
function methodTabsFor(
	activeTraps: readonly { readonly methodId: string; readonly methodName: string }[],
): readonly { readonly id: string; readonly label: string }[] {
	const byId = new Map<string, string>();
	for (const trap of activeTraps) {
		byId.set(trap.methodId, trap.methodName);
	}
	return [...byId.entries()]
		.map(([id, label]) => ({ id, label }))
		.sort((first, second) => first.label.localeCompare(second.label));
}

/**
 * The trap directory's left half: the active traps matching `filters`, the
 * method tabs those traps use, and the trap the selection names.
 */
export function useTrapDirectory(filters: DirectoryFilters): TrapDirectory {
	const { traps: activeTraps } = useActiveTraps();

	const methodTabs = methodTabsFor(activeTraps);

	// A method id left in the URL after its last trap was retired falls back to
	// All, rather than an empty list under a tab that is no longer there.
	const method = methodTabs.some((tab) => tab.id === filters.method) ? filters.method : ALL_METHODS;
	const search = filters.search.trim().toLowerCase();

	// Filtered here rather than in the query, for the reason the label is composed
	// here: a search runs against `Code - Name`, and the query cannot spell that.
	// The inventory is one eager, active-only shape, so this is a few hundred rows.
	const visibleTraps = activeTraps.filter((trap) => {
		if (method !== ALL_METHODS && trap.methodId !== method) {
			return false;
		}
		return search === '' || trapDisplayName(trap).toLowerCase().includes(search);
	});

	/*
	 * The selection survives a search — narrowing the list is not a request to look
	 * at a different trap, and re-anchoring on every keystroke would fire an
	 * on-demand collections query per letter. Switching method tabs does re-anchor,
	 * because the held trap is no longer one of the ones on screen.
	 */
	const held = activeTraps.find((trap) => trap.id === filters.trap);
	const selectedTrap =
		held !== undefined && (method === ALL_METHODS || held.methodId === method)
			? held
			: (visibleTraps[0] ?? null);

	return {
		methodTabs,
		method,
		visibleTraps,
		selectedTrap,
		hasActiveTraps: activeTraps.length > 0,
		isNarrowed: search !== '' || method !== ALL_METHODS,
	};
}
