create type public.species_sex_enum as enum ('male', 'female');
create type public.species_status_enum as enum ('damaged', 'unfed', 'bloodfed', 'gravid');

create table public.collection_species(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete set null,
    collection_id uuid not null references public.collections(id) on delete cascade,
    species_id uuid not null references public.species(id) on delete restrict,
    count integer not null,
    identified_by uuid references public.profiles(id) on delete set null,
    identified_date date not null,
    sex public.species_sex_enum default 'female',
    "status" public.species_status_enum,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_by uuid references auth.users (id) on delete set null,
    constraint count_non_negative check (count >= 0)
);

create trigger handle_created_trigger before insert on public.collection_species for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger before
update on public.collection_species for each row when (old.* is distinct from new.*)
execute function public.set_updated_record_fields ();

create trigger soft_delete_trigger
before delete on public.collection_species
for each row
execute function simmer.soft_delete();

alter table public.collection_species enable row level security;

create policy "select: own groups"
on public.collection_species
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own groups collector"
on public.collection_species
for insert
to authenticated
with check (public.user_has_group_role(group_id, 4));

create policy "update: own groups collector"
on public.collection_species
for update
to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));

create policy "delete: own groups collector"
on public.collection_species
for delete
to authenticated
using (public.user_has_group_role(group_id, 4));