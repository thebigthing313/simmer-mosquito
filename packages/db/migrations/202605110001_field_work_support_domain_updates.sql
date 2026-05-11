-- migrate:up

drop index if exists comments_pinned_idx;

alter table tag_items
  add column organization_id uuid references organizations(id) on delete restrict;

update tag_items
set organization_id = tags.organization_id
from tags
where tag_items.tag_id = tags.id;

alter table tag_items
  alter column organization_id set not null;

create index tag_items_organization_entity_idx
  on tag_items (organization_id, entity_type, entity_id)
  where deleted_at is null;

drop index if exists tags_organization_name_unique;

create unique index tags_organization_normalized_name_unique
  on tags (organization_id, lower(btrim(tag_name)))
  where deleted_at is null;

drop index if exists routes_organization_name_unique;

create unique index routes_organization_normalized_name_unique
  on routes (organization_id, lower(btrim(route_name)))
  where deleted_at is null;

alter table assignment_items
  add column completed_at timestamptz,
  add column completed_by_profile_id uuid references profiles(id) on delete set null,
  add column skipped_at timestamptz,
  add column skipped_by_profile_id uuid references profiles(id) on delete set null,
  add column skip_reason text,
  add constraint assignment_items_progress_exclusive
    check (completed_at is null or skipped_at is null);

create index assignment_items_completed_idx
  on assignment_items (assignment_id, completed_at)
  where deleted_at is null and completed_at is not null;

create index assignment_items_skipped_idx
  on assignment_items (assignment_id, skipped_at)
  where deleted_at is null and skipped_at is not null;

-- migrate:down

drop index if exists assignment_items_skipped_idx;
drop index if exists assignment_items_completed_idx;

alter table assignment_items
  drop constraint if exists assignment_items_progress_exclusive,
  drop column if exists skip_reason,
  drop column if exists skipped_by_profile_id,
  drop column if exists skipped_at,
  drop column if exists completed_by_profile_id,
  drop column if exists completed_at;

drop index if exists routes_organization_normalized_name_unique;

create unique index routes_organization_name_unique
  on routes (organization_id, route_name)
  where deleted_at is null;

drop index if exists tags_organization_normalized_name_unique;

create unique index tags_organization_name_unique
  on tags (organization_id, tag_name)
  where deleted_at is null;

drop index if exists tag_items_organization_entity_idx;

alter table tag_items
  drop column if exists organization_id;

create index comments_pinned_idx
  on comments (organization_id, is_pinned, commented_at desc)
  where deleted_at is null and is_pinned = true;
