-- 1. Create the new types
create type "public"."mosquito_sex" as enum ('male', 'female');
create type "public"."mosquito_status" as enum ('damaged', 'unfed', 'bloodfed', 'gravid');

-- 2. Drop the old defaults so Postgres stops enforcing type matching during the transition
alter table "public"."collection_results" alter column "sex" drop default;
alter table "public"."collection_results" alter column "status" drop default;

-- 3. Convert the column data types (casting through text)
alter table "public"."collection_results" 
  alter column "sex" set data type public.mosquito_sex using "sex"::text::public.mosquito_sex,
  alter column "status" set data type public.mosquito_status using "status"::text::public.mosquito_status;

-- 4. Apply the new defaults now that the types match
alter table "public"."collection_results" alter column "sex" set default 'female'::public.mosquito_sex;

-- 5. Clean up the old types
drop type "public"."species_sex";
drop type "public"."species_status";