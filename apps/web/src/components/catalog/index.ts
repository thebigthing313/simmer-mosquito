/**
 * The frame every lookup catalog in the workspace is built on: habitat types,
 * collection methods, the three control-method catalogs, insecticides, and
 * formulations.
 *
 * All of them are the same page — a heading with an access badge, a lifecycle
 * split with counts, a filter that appears once the list is worth filtering, a
 * table of rows, a row menu offering edit and a reversible retire, and a dialog
 * or drawer to write in. Each was written separately, so the frame drifted: one
 * table clipped its overflow instead of scrolling it, one row menu was narrower
 * than the hint it had to hold.
 *
 * Insecticides and formulations add a second tier: each row expands into the
 * batches of a product or the products in a mix, through
 * {@link CatalogExpandButton} and {@link CatalogDetailPanel}. That is the only
 * difference. Their rows sit in the same Active and Inactive sections, under
 * the same counts and filter, and carry the same row menu, with delete inside
 * the drawer the menu's Edit opens.
 *
 * What stays in the page is what the catalog is *for* — its columns, its fields,
 * and its commands. In particular a page decides for itself whether a
 * deactivation can be pre-empted: {@link CatalogRowActions} takes that as a prop
 * and never computes it, because whether a local count is trustworthy depends on
 * whether the referring records sync eagerly.
 */

export { CatalogDeleteDialog } from './catalog-delete-dialog';
export {
	CatalogDetailPanel,
	CatalogExpandButton,
	CatalogInactiveDisclosure,
	CatalogNote,
} from './catalog-detail-panel';
export {
	type CatalogFormValues,
	catalogFields,
	catalogFormValues,
} from './catalog-fields';
export { commitCatalogSave, toggleCatalogActive } from './catalog-lifecycle';
export { CatalogFilteredList, CatalogPage } from './catalog-page';
export { CatalogDialogCancel, CatalogRecordDialog } from './catalog-record-dialog';
export { CatalogDrawerCancel, CatalogRecordDrawer } from './catalog-record-drawer';
export { CatalogRowActions } from './catalog-row-actions';
export { CatalogActionsHead, CatalogNameCell, CatalogSection } from './catalog-section';
