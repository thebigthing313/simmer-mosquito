-- migrate:up
alter table traps
  drop constraint if exists traps_collection_method_org_fkey,
  drop constraint if exists traps_address_org_fkey,
  drop constraint if exists traps_collection_lure_org_fkey;

alter table collection_methods
  drop constraint if exists collection_methods_organization_id_id_unique;

alter table collection_lures
  drop constraint if exists collection_lures_organization_id_id_unique;

alter table addresses
  drop constraint if exists addresses_organization_id_id_unique;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'traps_collection_method_id_fkey'
  ) then
    alter table traps
      add constraint traps_collection_method_id_fkey
        foreign key (collection_method_id)
        references collection_methods(id)
        on delete restrict;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'traps_address_id_fkey'
  ) then
    alter table traps
      add constraint traps_address_id_fkey
        foreign key (address_id)
        references addresses(id)
        on delete restrict;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'traps_collection_lure_id_fkey'
  ) then
    alter table traps
      add constraint traps_collection_lure_id_fkey
        foreign key (collection_lure_id)
        references collection_lures(id)
        on delete set null;
  end if;
end;
$$;

-- migrate:down
select 1;
