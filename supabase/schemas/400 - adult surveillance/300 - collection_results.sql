create type public.species_sex as enum ('male', 'female');
create type public.species_status as enum ('damaged', 'unfed', 'bloodfed', 'gravid');

create table public.collection_results(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    collection_id uuid not null references public.collections(id) on delete cascade on update cascade,
    landing_rate_id uuid references public.landing_rates(id) on delete restrict on update cascade,
    species_id uuid not null references public.species(id) on delete restrict on update cascade,
    mosquito_count integer not null,
    identified_by uuid references public.profiles(user_id) on delete set null on update cascade,
    sex public.species_sex default 'female',
    "status" public.species_status,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade
    constraint count_non_negative check (mosquito_count >= 0),
    constraint one_source check ((collection_id is not null) or (landing_rate_id is not null))
);

create trigger set_audit_fields
before insert or update on public.collection_results
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.collection_results
for each row
execute function simmer.soft_delete();

alter table public.collection_results enable row level security;

create policy "select: own groups"
on public.collection_results
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own groups collector"
on public.collection_results
for insert
to authenticated
with check (public.user_has_group_role(group_id, 4));

create policy "update: own groups collector"
on public.collection_results
for update
to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));

create policy "delete: own groups collector"
on public.collection_results
for delete
to authenticated
using (public.user_has_group_role(group_id, 4));