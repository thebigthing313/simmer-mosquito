-- migrate:up

-- Multipart geometry, ADR 0018. Nine CHECK swaps and one column widening make a
-- record storable in several parts. Nothing is backfilled: every existing row
-- keeps the type it has.
--
-- The eight work-record tables take all six OGC shapes. MultiPoint is in the
-- list because catch-basin larviciding treats a set of separated points in one
-- visit, and recording that as a polygon around the block claims treatment of
-- everything between the basins.
--
-- A CHECK swap is invisible to the replication stream: 0 decoded messages and 0
-- bytes on the wire, 4,752 bytes of WAL.

alter table habitats
  drop constraint habitats_geom_type_check,
  add constraint habitats_geom_type_check
    check (geometrytype(geom) in (
      'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT', 'MULTILINESTRING', 'MULTIPOLYGON'
    ));

alter table inspections
  drop constraint inspections_geom_type_check,
  add constraint inspections_geom_type_check
    check (geometrytype(geom) in (
      'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT', 'MULTILINESTRING', 'MULTIPOLYGON'
    ));

alter table applications
  drop constraint applications_geom_type_check,
  add constraint applications_geom_type_check
    check (geometrytype(geom) in (
      'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT', 'MULTILINESTRING', 'MULTIPOLYGON'
    ));

alter table source_reductions
  drop constraint source_reductions_geom_type_check,
  add constraint source_reductions_geom_type_check
    check (geometrytype(geom) in (
      'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT', 'MULTILINESTRING', 'MULTIPOLYGON'
    ));

alter table outreach_actions
  drop constraint outreach_actions_geom_type_check,
  add constraint outreach_actions_geom_type_check
    check (geometrytype(geom) in (
      'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT', 'MULTILINESTRING', 'MULTIPOLYGON'
    ));

alter table biocontrol_actions
  drop constraint biocontrol_actions_geom_type_check,
  add constraint biocontrol_actions_geom_type_check
    check (geometrytype(geom) in (
      'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT', 'MULTILINESTRING', 'MULTIPOLYGON'
    ));

alter table requested_control_actions
  drop constraint requested_control_actions_geom_type_check,
  add constraint requested_control_actions_geom_type_check
    check (geometrytype(geom) in (
      'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT', 'MULTILINESTRING', 'MULTIPOLYGON'
    ));

alter table mission_items
  drop constraint mission_items_geom_type_check,
  add constraint mission_items_geom_type_check
    check (geometrytype(geom) in (
      'POINT', 'LINESTRING', 'POLYGON', 'MULTIPOINT', 'MULTILINESTRING', 'MULTIPOLYGON'
    ));

-- The one narrowing in the effort. A Registration is a subscription tied to a
-- place, so two places are two Registrations and the multi shapes have a better
-- answer already in the model. A line-shaped notification area has no story and
-- no UI, so LineString goes with them.
--
-- Precondition: production holds no notification_registrations rows, so this
-- converts nothing. On a database that does hold one of a shape leaving the
-- list, the add fails with SQLSTATE 23514 and the whole migration rolls back.
alter table notification_registrations
  drop constraint notification_registrations_geom_type_check,
  add constraint notification_registrations_geom_type_check
    check (geometrytype(geom) in ('POINT', 'POLYGON'));

-- geojson is a stored generated column over geom, and regions_centroid names
-- geom in its `update of` list. Postgres refuses `alter column type` with
-- SQLSTATE 0A000 while either one depends on the column, so both come off first
-- and go back after. Keeping the drop, the retype and the re-add in one
-- `alter table` is what makes this one rewrite instead of two: 494 KB of WAL
-- rather than 811 KB, and the CHECK validates against the rewritten heap in the
-- same pass.
--
-- The rewrite is safe beside a live Electric slot. Postgres writes it into a
-- transient heap and the reorder buffer drops changes on such a relation before
-- the output plugin sees them: 0 decoded messages and 0 bytes on the wire at
-- 345 rows and again at 200,000. What it does cost is reorder buffer, linear in
-- heap bytes, 1.42 MB at production size with no spill.
drop trigger regions_centroid on regions;

alter table regions
  drop column geojson,
  alter column geom type geometry(Geometry, 4326),
  add column geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored,
  add constraint regions_geom_type_check
    check (geometrytype(geom) in ('POLYGON', 'MULTIPOLYGON'));

create trigger regions_centroid
  before insert or update of geom on regions
  for each row execute function set_owned_centroid();

-- The CHECK is not optional. After the widening the typmod stops being the
-- constraint and a bare Point inserts happily, with the trigger stamping
-- geom_type = 'st_point'. geometry(Polygon,4326) was the only guard.
--
-- geometrytype(), not st_geometrytype(). The two share no vocabulary:
-- geometrytype() returns bare uppercase POLYGON and st_geometrytype() returns
-- ST_Polygon, so neither list is usable in the other place. A GeometryCollection
-- of polygons cannot slip the two-name list either, because geometrytype()
-- reports the container.

-- The type change drops geom's pg_stats row. Without this the GiST scan
-- estimates 1 row where 43 come back.
analyze regions;

-- migrate:down

-- Every other migration in this set rolls back whatever the data looks like.
-- This one can refuse. Narrowing geom back makes Postgres re-check the typmod on
-- every row, and one MultiPolygon aborts the rewrite with SQLSTATE 22023, naming
-- no table, no column and no row. ST_Dump would clear the way by splitting each
-- multipart Region into one row per part, inventing ids and names for parts
-- nobody named, so this refuses and names the rows instead.
--
-- The count reads geometrytype(geom) rather than the geom_type column, because
-- geom_type is maintained by regions_centroid and the thing that fails reads the
-- geometry. It ignores deleted_at on purpose: the re-check reads soft-deleted
-- rows too, though every read in the app skips them. Everything a reader needs
-- goes in the message, because dbmate prints the message and drops detail and
-- hint.
do $$
declare
  v_multipart bigint;
begin
  select count(*) into v_multipart
  from regions
  where geometrytype(geom) <> 'POLYGON';

  if v_multipart > 0 then
    raise exception
      'Cannot narrow regions.geom back to geometry(Polygon, 4326): % region row(s) hold a MultiPolygon. List them with: select id, name, deleted_at from regions where geometrytype(geom) <> ''POLYGON''. Soft-deleted rows count. Redraw each one as a single Polygon or hard-delete it, then roll back again.',
      v_multipart;
  end if;
end;
$$;

drop trigger regions_centroid on regions;

alter table regions
  drop constraint if exists regions_geom_type_check,
  drop column geojson,
  alter column geom type geometry(Polygon, 4326),
  add column geojson jsonb generated always as (st_asgeojson(geom)::jsonb) stored;

create trigger regions_centroid
  before insert or update of geom on regions
  for each row execute function set_owned_centroid();

analyze regions;

alter table notification_registrations
  drop constraint notification_registrations_geom_type_check,
  add constraint notification_registrations_geom_type_check
    check (geometrytype(geom) in ('POINT', 'LINESTRING', 'POLYGON'));

-- The eight work-record tables narrow back. A row holding a multi shape fails
-- the add with SQLSTATE 23514 and names its own table, which is the thing the
-- regions block above cannot do for itself.
alter table habitats
  drop constraint habitats_geom_type_check,
  add constraint habitats_geom_type_check
    check (geometrytype(geom) in ('POINT', 'LINESTRING', 'POLYGON'));

alter table inspections
  drop constraint inspections_geom_type_check,
  add constraint inspections_geom_type_check
    check (geometrytype(geom) in ('POINT', 'LINESTRING', 'POLYGON'));

alter table applications
  drop constraint applications_geom_type_check,
  add constraint applications_geom_type_check
    check (geometrytype(geom) in ('POINT', 'LINESTRING', 'POLYGON'));

alter table source_reductions
  drop constraint source_reductions_geom_type_check,
  add constraint source_reductions_geom_type_check
    check (geometrytype(geom) in ('POINT', 'LINESTRING', 'POLYGON'));

alter table outreach_actions
  drop constraint outreach_actions_geom_type_check,
  add constraint outreach_actions_geom_type_check
    check (geometrytype(geom) in ('POINT', 'LINESTRING', 'POLYGON'));

alter table biocontrol_actions
  drop constraint biocontrol_actions_geom_type_check,
  add constraint biocontrol_actions_geom_type_check
    check (geometrytype(geom) in ('POINT', 'LINESTRING', 'POLYGON'));

alter table requested_control_actions
  drop constraint requested_control_actions_geom_type_check,
  add constraint requested_control_actions_geom_type_check
    check (geometrytype(geom) in ('POINT', 'LINESTRING', 'POLYGON'));

alter table mission_items
  drop constraint mission_items_geom_type_check,
  add constraint mission_items_geom_type_check
    check (geometrytype(geom) in ('POINT', 'LINESTRING', 'POLYGON'));
