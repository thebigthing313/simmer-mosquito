-- migrate:up

-- Where a map opens for an Organization when the surface has no rows to fit.
--
-- `#1413`: a surface with nothing to frame opened over the continental US,
-- which is every map a new Organization sees. The client geocodes the mailing
-- address when it is saved on My Organization and sends the top result in the
-- same write, so these are written by `identity.updateOrganizationDetails` and
-- nothing else.
--
-- Plain numbers rather than a geometry column: nothing queries them spatially,
-- and a geometry would put the table into `OWNED_GEOMETRY_POLICIES`. Not named
-- `lat` and `lng`, because the client strips those two from every outgoing
-- command body, where a trigger maintains them on the geometry tables.
--
-- Null on every existing row. An Organization gets a centre the next time its
-- address is saved.

alter table organizations
  add column map_center_lat double precision,
  add column map_center_lng double precision,
  add constraint organizations_map_center_lat_range
    check (map_center_lat between -90 and 90),
  add constraint organizations_map_center_lng_range
    check (map_center_lng between -180 and 180),
  add constraint organizations_map_center_pair
    check ((map_center_lat is null) = (map_center_lng is null));

-- migrate:down

alter table organizations
  drop constraint organizations_map_center_pair,
  drop constraint organizations_map_center_lng_range,
  drop constraint organizations_map_center_lat_range,
  drop column map_center_lng,
  drop column map_center_lat;
