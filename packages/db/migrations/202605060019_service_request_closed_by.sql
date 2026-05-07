-- migrate:up
alter table service_requests
  add column closed_by_profile_id uuid references profiles(id) on delete set null;

create index service_requests_closed_by_idx
  on service_requests (organization_id, closed_by_profile_id)
  where deleted_at is null and closed_by_profile_id is not null;

-- migrate:down
drop index if exists service_requests_closed_by_idx;

alter table service_requests
  drop column if exists closed_by_profile_id;
