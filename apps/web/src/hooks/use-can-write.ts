import { hasAtLeastRole, type MinimumRole } from '../lib/write-access';
import { useAuthSnapshot } from './use-auth-snapshot';

/**
 * Whether to render a control that would start a write — a create button, an
 * Edit link, a delete action, an inline add form — at the floor that control's
 * command requires.
 *
 * Viewers get the record, not the pencil. Hiding rather than disabling is the
 * choice here: a disabled Edit button asks the reader to work out why, on every
 * page, forever, when the answer is a fact about their account rather than
 * about the record in front of them.
 *
 * A collector records work but does not plan it, and neither records nor plans
 * is the same as configuring the organization — so the ladder the server
 * enforces is the ladder the page draws.
 *
 * Route access is guarded separately, in `beforeLoad` — see
 * `lib/write-access`. This hook only decides what is drawn.
 */
export function useHasRole(minimum: MinimumRole): boolean {
	return hasAtLeastRole(useAuthSnapshot(), minimum);
}
