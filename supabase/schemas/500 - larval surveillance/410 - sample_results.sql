create table public.sample_results(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    sample_id uuid not null references public.samples(id) on delete restrict on update cascade,
    species_id uuid not null references public.species(id) on delete restrict on update cascade,
    identified_by uuid not null references public.profiles (user_id) on delete restrict on update cascade,
    identified_at date not null,
    larvae_count integer not null,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
    constraint larvae_count_positive check (larvae_count >= 0),
    constraint unique_sample_species unique (sample_id, species_id)
);

create trigger set_audit_fields
before insert or update on public.sample_results
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.sample_results
for each row
execute function simmer.soft_delete();
alter table public.sample_results enable row level security;

create policy "select: own groups"
on public.sample_results
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group collector"
on public.sample_results
for insert
to authenticated
with check (public.user_has_group_role(group_id, 4));

create policy "update: own group collector"
on public.sample_results
for update
to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));

create policy "delete: own group manager or own records"
on public.sample_results
for delete
to authenticated
using (public.user_has_group_role(group_id, 3) or user_owns_record(created_by));