-- migrate:up

create or replace function pg_temp.require_no_null_organization_id(target_table regclass)
returns void
language plpgsql
as $$
declare
  has_null boolean;
begin
  execute format('select exists (select 1 from %s where organization_id is null)', target_table)
  into has_null;

  if has_null then
    raise exception 'Cannot make %.organization_id not null because some rows could not be backfilled.', target_table;
  end if;
end;
$$;

drop index if exists insecticide_batches_insecticide_idx;

alter table insecticide_batches
  add column if not exists organization_id uuid references organizations(id) on delete restrict;

update insecticide_batches
set organization_id = insecticides.organization_id
from insecticides
where insecticides.id = insecticide_batches.insecticide_id
  and insecticide_batches.organization_id is null;

select pg_temp.require_no_null_organization_id('insecticide_batches');

alter table insecticide_batches
  alter column organization_id set not null;

create index insecticide_batches_organization_insecticide_idx
  on insecticide_batches (organization_id, insecticide_id, is_active, batch_name)
  where deleted_at is null;

-- migrate:down

drop index if exists insecticide_batches_organization_insecticide_idx;

alter table insecticide_batches
  drop column if exists organization_id;

create index insecticide_batches_insecticide_idx
  on insecticide_batches (insecticide_id, is_active, batch_name)
  where deleted_at is null;
