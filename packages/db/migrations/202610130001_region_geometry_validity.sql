-- migrate:up

-- A Region's geometry is valid, and stays valid (#1671, the 2026-10-13
-- amendment on ADR 0015).
--
-- Region membership now measures how much ground two areas share, and
-- `st_intersection` throws a TopologyException on a self-intersecting ring
-- rather than answering. Fifteen live Regions on the production clone hold
-- one. So the Region side of the predicate has to be valid, and this is where
-- that is made true: the function below repairs on write, the update repairs
-- what is already stored, and the CHECK holds the rule.
--
-- Regions only. A record area keeps the shape Split writes, two pieces sharing
-- the line they were cut along (#497, #518), which OGC calls invalid and which
-- `st_makevalid` would dissolve back into one piece. The predicate reads a
-- record through `st_makevalid` where it is invalid instead.

-- The repair. `st_makevalid` on its default method, because the compose image
-- runs GEOS 3.9 and silently ignores `method=structure`. It can hand back a
-- GeometryCollection carrying stray lines beside the polygons, so only the
-- polygonal part is kept, and a one-part MultiPolygon is demoted, because ADR
-- 0018 says one never exists. A ring with no area left after repair is refused
-- rather than stored empty. A valid geometry passes through untouched.
create function valid_region_geom(geom geometry) returns geometry
  language plpgsql immutable strict
  as $$
declare
  repaired geometry;
begin
  if st_isvalid(geom) then
    return geom;
  end if;
  repaired := st_collectionextract(st_makevalid(geom), 3);
  if st_isempty(repaired) then
    raise exception 'Region geometry covers no ground once its self-intersections are repaired.'
      using errcode = '22023';
  end if;
  if st_numgeometries(repaired) = 1 then
    return st_geometryn(repaired, 1);
  end if;
  return repaired;
end;
$$;

-- Soft-deleted rows too, because the CHECK reads every row. Fifteen live rows
-- on the clone and the outlines do not move: the repair nodes each ring where it
-- crosses itself. `set_owned_centroid` refreshes `lat`, `lng` and `geom_type`.
update regions
  set geom = valid_region_geom(geom)
  where not st_isvalid(geom);

alter table regions
  add constraint regions_geom_valid_check check (st_isvalid(geom));

-- migrate:down

-- The repair is not undone. The self-intersecting rings it replaced are gone,
-- and putting them back would only make membership reads throw again.
alter table regions drop constraint regions_geom_valid_check;
drop function valid_region_geom(geometry);
