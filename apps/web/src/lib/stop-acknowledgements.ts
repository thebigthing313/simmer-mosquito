/**
 * The refusals a technician is allowed to answer, and the flag that answers them.
 *
 * Recording work against a stop has four preconditions that are questions rather
 * than rules: the stop is already completed, the record names a different target
 * of the same kind, the action cites a different requested action, the action
 * does not cover the ground the stop names. Each is usually a mistake and
 * occasionally the truth, so the server refuses once and accepts the same write
 * again with the matching flag set.
 *
 * A wrong *type* of record, or a mission whose control type does not match, is
 * absent on purpose: those are always bugs and the server never takes a flag for
 * them (`docs/field-work-support-domain.md`, `docs/mission-dispatch-domain.md`).
 */
const ACKNOWLEDGEABLE_REFUSALS = {
	assignment_item_already_completed: 'acknowledgedCompletedItemAdditionalRecord',
	assignment_item_target_mismatch: 'acknowledgedTargetMismatch',
	mission_item_requested_action_mismatch: 'acknowledgedRequestedActionMismatch',
	mission_geometry_not_covered: 'acknowledgedMissionGeometryNotCovered',
} as const satisfies Readonly<Record<string, string>>;

export type AcknowledgeableRefusal = keyof typeof ACKNOWLEDGEABLE_REFUSALS;

/**
 * The flags to send with a write, keyed exactly as the endpoint reads them.
 *
 * Only ever `true`: absence is the default, and `readExecutionOptions` only acts
 * on an explicit `true`.
 */
export type StopAcknowledgements = Partial<
	Record<(typeof ACKNOWLEDGEABLE_REFUSALS)[AcknowledgeableRefusal], true>
>;

/** The refusal code a failed write carried, if it is one a flag can answer. */
export function acknowledgeableRefusalOf(error: unknown): AcknowledgeableRefusal | null {
	const body = (error as { readonly body?: unknown } | null)?.body;
	if (typeof body !== 'object' || body === null) {
		return null;
	}
	const code = (body as { readonly error?: unknown }).error;
	return typeof code === 'string' && code in ACKNOWLEDGEABLE_REFUSALS
		? (code as AcknowledgeableRefusal)
		: null;
}

/** The same write, now answering the question it was refused over. */
export function withAcknowledgement(
	acknowledgements: StopAcknowledgements,
	refusal: AcknowledgeableRefusal,
): StopAcknowledgements {
	return { ...acknowledgements, [ACKNOWLEDGEABLE_REFUSALS[refusal]]: true };
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
	for (const flag of Object.values(ACKNOWLEDGEABLE_REFUSALS)) {
		if ((value as Record<string, unknown>)[flag] === true) {
			flags[flag] = true;
		}
	}
	return flags;
}
