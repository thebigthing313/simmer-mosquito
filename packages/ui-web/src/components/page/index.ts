/**
 * The page frame's shared parts: the heading a work surface opens with, and the
 * states a list shows before it has rows.
 *
 * The organization workspace (`apps/web`) and the operator console
 * (`apps/admin`) had written these twice — the icon-tile header as one class
 * string at six sites, the no-matches line character for character at four. Two
 * consoles from one product should not disagree about what a page heading looks
 * like, and until this module existed that agreement was enforced by nobody.
 *
 * What belongs here is what carries no domain content: a component that would
 * need an `if (app === 'admin')` branch belongs in the app instead.
 */

export { ListEmpty, ListLoading, ListNoMatches } from './list-states';
export { PageHeader } from './page-header';
