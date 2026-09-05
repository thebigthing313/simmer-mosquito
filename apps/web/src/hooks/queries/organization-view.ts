/**
 * What the Organization's own record looks like above the query layer.
 *
 * Not a hook, so not a `use-` file. The Organization is read in two quite
 * different ways and each has its own hook: what it is called and which row it
 * is ({@link OrganizationIdentity}), and how it is configured
 * (`use-organization-settings.ts`, which returns a domain type rather than
 * anything shaped here).
 */

/**
 * Which Organization this is, and what to call it.
 *
 * Two columns rather than the whole row, because these are what a surface that
 * is not *about* the Organization needs from it: the id every scoped query and
 * every create command carries, and the name the shell puts in the header. The
 * record as a whole, mailing address and contact and slug, belongs to the
 * settings pages, which read and write it together.
 */
export interface OrganizationIdentity {
	readonly id: string;
	readonly name: string;
}
