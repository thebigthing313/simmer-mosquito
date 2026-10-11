/**
 * The zoom at which a clustered tileset stops clustering.
 *
 * Below it, a tileset that clusters draws the points of each grid cell as one
 * feature; at and above it the tile is the unclustered one. It lives here rather
 * than beside the tile encoding in `packages/db` because both halves read it:
 * the tile query decides from it whether to group, and `apps/web`, which has no
 * dependency on `packages/db`, fits a cluster whose points share one spot to it.
 *
 * 15 is also the zoom the explorer frames a single record at: `FIT_POINT_ZOOM`
 * in `use-map-extent-fit.ts` is this constant, so a record the map is asked to
 * show on its own is always drawn as itself. Measured on the prod clone's 417 traps at a 512-unit
 * cell, zoom 13 draws 361 features, 14 draws 374 and 15 draws 380, against 395
 * distinct positions, so by the cut-off a cluster is a few traps a street apart
 * and clustering any further in would hide almost nothing.
 */
export const MAP_CLUSTER_UNTIL_ZOOM = 15;
