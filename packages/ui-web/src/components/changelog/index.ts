/**
 * The release-history surface both consoles publish at `/changelog`.
 *
 * It lives here rather than in either app because the two would otherwise
 * render the same generated file two different ways, and a user who sees both
 * consoles would have no reason to believe they are one product.
 */

export { ChangelogPage } from './changelog-page';
