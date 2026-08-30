/**
 * The refusals a technician is allowed to answer, and the flag that answers them.
 *
 * Recording work against a stop has preconditions that are questions rather than
 * rules: the stop is already completed, the record names a different target of
 * the same kind, the action cites a different requested action, the action does
 * not cover the ground the stop names. Each is usually a mistake and occasionally
 * the truth, so the server refuses once and accepts the same write again with the
 * matching flag set.
 *
 * "Already completed" appears twice because the two sides name it differently and
 * take different flags — the same question about an assignment stop and a mission
 * stop, since a place treated twice in a day is as ordinary as a habitat
 * inspected twice.
 *
 * A wrong *type* of record, or a mission whose control type does not match, is
 * absent on purpose: those are always bugs and the server never takes a flag for
 * them (`docs/field-work-support-domain.md`, `docs/mission-dispatch-domain.md`).
 *
 * The two assignment refusals now arrive as `acknowledgement_required` naming
 * their own flag (#336), so their codes are no longer what identifies them.
 * They stay because the map is also the list of questions this surface may be
 * asked, which is what `acknowledgeableRefusalOf` checks a named flag against.
 * The mission three are #316's, and the codes go once they follow.
 */
export const STOP_ACKNOWLEDGEABLE_REFUSALS = {
	assignment_item_already_completed: 'acknowledgedCompletedItemAdditionalRecord',
	assignment_item_target_mismatch: 'acknowledgedTargetMismatch',
	mission_item_already_completed: 'acknowledgedCompletedItemAdditionalAction',
	mission_item_requested_action_mismatch: 'acknowledgedRequestedActionMismatch',
	mission_geometry_not_covered: 'acknowledgedMissionGeometryNotCovered',
} as const satisfies Readonly<Record<string, string>>;

export type AcknowledgeableRefusal = keyof typeof STOP_ACKNOWLEDGEABLE_REFUSALS;

/**
 * The flags to send with a write, keyed exactly as the endpoint reads them.
 *
 * Only ever `true`: absence is the default, and `readExecutionOptions` only acts
 * on an explicit `true`.
 */
export type StopAcknowledgements = Partial<
	Record<(typeof STOP_ACKNOWLEDGEABLE_REFUSALS)[AcknowledgeableRefusal], true>
>;

/**
 * The acknowledgement flag that answers a failed write, if the refusal is one a
 * flag can answer.
 *
 * `refusals` is the map to judge against, because the two families of
 * acknowledgeable write are refused over different things, see
 * `useAcknowledgedWrite`.
 */
export function acknowledgeableRefusalOf<TRefusals extends Readonly<Record<string, string>>>(
	error: unknown,
	refusals: TRefusals,
): TRefusals[keyof TRefusals] | null {
	const body = (error as { readonly body?: unknown } | null)?.body;
	if (typeof body !== 'object' || body === null) {
		return null;
	}
	const code = (body as { readonly error?: unknown }).error;
	if (typeof code !== 'string') {
		return null;
	}
	// The settled refusal names its own flag, so there is no per-code entry to
	// look up. It is still checked against this caller's map, because the map is
	// what says which questions this surface can ask.
	if (code === 'acknowledgement_required') {
		const flag = (body as { readonly flag?: unknown }).flag;
		const askable: readonly string[] = Object.values(refusals);
		return typeof flag === 'string' && askable.includes(flag)
			? (flag as TRefusals[keyof TRefusals])
			: null;
	}
	// Generic over the map so a caller keeps the literal union of its own flags
	// rather than a bare `string`. A misspelled flag then fails to compile where it
	// is declared, instead of becoming a question the user answers and the server
	// never hears.
	return Object.hasOwn(refusals, code) ? refusals[code as keyof TRefusals] : null;
}

/**
 * The flags a mutation carried, read off its metadata.
 *
 * They travel as mutation metadata rather than as row columns because they are
 * not properties of the record — nothing about an inspection says whether its
 * stop was already completed. The same channel `locationSource` uses.
 */
export function readAcknowledgements(metadata: unknown): StopAcknowledgements {
	if (typeof metadata !== 'object' || metadata === null) {
		return {};
	}
	const value = (metadata as { readonly acknowledgements?: unknown }).acknowledgements;
	if (typeof value !== 'object' || value === null) {
		return {};
	}
	const flags: Record<string, true> = {};
	for (const flag of Object.values(STOP_ACKNOWLEDGEABLE_REFUSALS)) {
		if ((value as Record<string, unknown>)[flag] === true) {
			flags[flag] = true;
		}
	}
	return flags;
}
