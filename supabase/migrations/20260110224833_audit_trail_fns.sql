
  create table "simmer"."deleted_data" (
    "id" uuid not null default gen_random_uuid(),
    "deleted_at" timestamp with time zone not null default now(),
    "original_table" text not null,
    "original_id" uuid not null,
    "data" jsonb not null
      );


CREATE UNIQUE INDEX deleted_data_pkey ON simmer.deleted_data USING btree (id);

alter table "simmer"."deleted_data" add constraint "deleted_data_pkey" PRIMARY KEY using index "deleted_data_pkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.set_updated_record_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
    begin
        if TG_OP = 'UPDATE' then
            new.updated_at = now();
            new.updated_by = auth.uid();
        end if;

        return new;
    end;
$function$
;

CREATE OR REPLACE FUNCTION simmer.set_created_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
    begin
        if TG_OP = 'INSERT' then
            new.created_by = auth.uid();
        end if;
        return new;
    end;
$function$
;

CREATE OR REPLACE FUNCTION simmer.soft_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  begin
    insert into simmer.deleted_data (original_table, original_id, data)
    values (TG_TABLE_NAME, OLD.id, row_to_json(OLD)::jsonb);
    return OLD;
  end;
$function$
;


