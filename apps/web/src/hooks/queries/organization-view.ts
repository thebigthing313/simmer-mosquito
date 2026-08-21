/**
 * What the agency's own record looks like above the query layer.
 *
 * Not a hook, so not a `use-` file. The agency is read in two quite different
 * ways and each has its own hook: what it is called and which row it is
 * ({@link OrganizationIdentity}), and how it is configured
 * (`use-organization-settings.ts`, which returns a domain type rather than
 * anything shaped here).
 *
 * `Organization` rather than `Agency`, which is what `CONTEXT.md` calls this in
 * prose. The table is `organizations`, the WorkOS record is an organization, and
 * every one of the ~119 surfaces that reads it already says organization; a seam
 * that renamed it here would leave the app speaking both.
 */

/**
 * Which agency this is, and what to call it.
 *
 * Two columns rather than the whole row, because these are what a surface that
 * is not *about* the agency needs from it: the id every scoped query and every
 * create command carries, and the name the shell puts in the header. The record
 * as a whole — mailing address, contact, slug — belongs to the agency settings
 * pages, which read and write it together.
 */
export interface OrganizationIdentity {
	readonly id: string;
	readonly name: string;
}
