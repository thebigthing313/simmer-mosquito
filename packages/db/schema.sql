SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: collection_timing_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.collection_timing_mode AS ENUM (
    'exact_timestamps',
    'collection_date_duration'
);


--
-- Name: control_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.control_type AS ENUM (
    'application',
    'source_reduction',
    'biocontrol',
    'outreach'
);


--
-- Name: insecticide_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.insecticide_type AS ENUM (
    'larvicide',
    'adulticide',
    'pupicide',
    'other'
);


--
-- Name: larval_density; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.larval_density AS ENUM (
    'none',
    'light',
    'medium',
    'heavy',
    'very_heavy'
);


--
-- Name: membership_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.membership_status AS ENUM (
    'active',
    'inactive',
    'invited'
);


--
-- Name: mission_notification_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.mission_notification_status AS ENUM (
    'pending',
    'completed',
    'failed',
    'skipped'
);


--
-- Name: notification_channel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_channel AS ENUM (
    'email',
    'sms',
    'phone'
);


--
-- Name: organization_billing_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.organization_billing_mode AS ENUM (
    'manual_invoice'
);


--
-- Name: organization_subscription_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.organization_subscription_status AS ENUM (
    'trial',
    'active',
    'suspended',
    'canceled'
);


--
-- Name: request_intake_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.request_intake_type AS ENUM (
    'online',
    'phone',
    'walk-in',
    'other'
);


--
-- Name: route_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.route_type AS ENUM (
    'habitat',
    'trap'
);


--
-- Name: simmer_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.simmer_role AS ENUM (
    'owner',
    'admin',
    'manager',
    'collector',
    'viewer'
);


--
-- Name: species_sex; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.species_sex AS ENUM (
    'male',
    'female'
);


--
-- Name: species_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.species_status AS ENUM (
    'damaged',
    'unfed',
    'bloodfed',
    'gravid'
);


--
-- Name: unit_system; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.unit_system AS ENUM (
    'si',
    'imperial',
    'us_customary'
);


--
-- Name: unit_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.unit_type AS ENUM (
    'weight',
    'distance',
    'area',
    'volume',
    'temperature',
    'duration',
    'count',
    'speed'
);


--
-- Name: weather_source_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.weather_source_type AS ENUM (
    'organization',
    'nws'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: search_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_documents (
    source_table text NOT NULL,
    source_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    search_vector tsvector NOT NULL,
    search_text text[],
    search_text_joined text,
    fields jsonb NOT NULL,
    display jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: TABLE search_documents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.search_documents IS 'Derived search index over twelve record tables plus comments. Trigger-maintained; holds no column a client is not already allowed to receive through sync. No sync shape and no collection module.';


--
-- Name: search_document_build(text, uuid, uuid, text[], text[], jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_document_build(p_source_table text, p_source_id uuid, p_organization_id uuid, p_ident_keys text[], p_prose_keys text[], p_fields jsonb, p_display jsonb) RETURNS public.search_documents
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
	doc search_documents;
	ident text[];
	prose text[];
begin
	-- Declared order is preserved, because the reader breaks a tie on the matched
	-- field by taking the first field in declared order.
	select coalesce(array_agg(lower(s.v) order by t.ord), '{}'::text[])
		into ident
		from unnest(p_ident_keys) with ordinality t(k, ord)
		cross join lateral (select nullif(btrim(p_fields ->> t.k), '') as v) s
		where s.v is not null;

	select coalesce(array_agg(s.v order by t.ord), '{}'::text[])
		into prose
		from unnest(p_prose_keys) with ordinality t(k, ord)
		cross join lateral (select nullif(btrim(p_fields ->> t.k), '') as v) s
		where s.v is not null;

	doc.source_table := p_source_table;
	doc.source_id := p_source_id;
	doc.organization_id := p_organization_id;
	doc.search_text := nullif(ident, '{}'::text[]);
	doc.search_text_joined := nullif(array_to_string(ident, ' '), '');
	doc.search_vector :=
		setweight(to_tsvector('english', array_to_string(ident, ' ')), 'A')
		|| setweight(to_tsvector('english', array_to_string(prose, ' ')), 'B');
	doc.fields := p_fields;
	doc.display := p_display;
	return doc;
end;
$$;


--
-- Name: addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    display_name text NOT NULL,
    country character(2) NOT NULL,
    address_line_1 text,
    address_line_2 text,
    locality text,
    region text,
    postal_code text,
    geocoder_response jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    geom public.geometry(Point,4326) NOT NULL,
    lat double precision,
    lng double precision,
    geojson jsonb GENERATED ALWAYS AS ((public.st_asgeojson(geom))::jsonb) STORED,
    geom_type text
);


--
-- Name: search_document_from_addresses(public.addresses); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_document_from_addresses(r public.addresses) RETURNS public.search_documents
    LANGUAGE sql IMMUTABLE
    AS $$
	select search_document_build('addresses', r.id, r.organization_id,
		array['display_name', 'locality', 'postal_code'], array[]::text[],
		jsonb_strip_nulls(jsonb_build_object(
			'display_name', r.display_name, 'locality', r.locality,
			'postal_code', r.postal_code)),
		'{}'::jsonb);
$$;


--
-- Name: assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    assignment_name text,
    assigned_to_profile_id uuid,
    assigned_by_profile_id uuid,
    assignment_date date NOT NULL,
    due_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    cancellation_reason text,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid
);


--
-- Name: search_document_from_assignments(public.assignments); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_document_from_assignments(r public.assignments) RETURNS public.search_documents
    LANGUAGE sql IMMUTABLE
    AS $$
	select search_document_build('assignments', r.id, r.organization_id,
		array['assignment_name'], array[]::text[],
		jsonb_strip_nulls(jsonb_build_object('assignment_name', r.assignment_name)),
		'{}'::jsonb);
$$;


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    comment_text text NOT NULL,
    commented_by_profile_id uuid,
    commented_at timestamp with time zone DEFAULT now() NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid
);


--
-- Name: search_document_from_comments(public.comments); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_document_from_comments(r public.comments) RETURNS public.search_documents
    LANGUAGE sql IMMUTABLE
    AS $$
	select search_document_build('comments', r.id, r.organization_id,
		array[]::text[], array['comment_text'],
		jsonb_build_object('comment_text', r.comment_text),
		jsonb_build_object('entity_type', r.entity_type, 'entity_id', r.entity_id));
$$;


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    contact_name text,
    preferred_phone text,
    alternate_phone text,
    email text,
    company text,
    department text,
    title text,
    wants_email boolean DEFAULT false NOT NULL,
    wants_sms boolean DEFAULT false NOT NULL,
    wants_phone boolean DEFAULT false NOT NULL,
    metadata jsonb,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid
);


--
-- Name: search_document_from_contacts(public.contacts); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_document_from_contacts(r public.contacts) RETURNS public.search_documents
    LANGUAGE sql IMMUTABLE
    AS $$
	select search_document_build('contacts', r.id, r.organization_id,
		array['contact_name', 'company', 'email', 'preferred_phone', 'alternate_phone'],
		array[]::text[],
		jsonb_strip_nulls(jsonb_build_object(
			'contact_name', r.contact_name, 'company', r.company, 'email', r.email,
			'preferred_phone', r.preferred_phone, 'alternate_phone', r.alternate_phone)),
		'{}'::jsonb);
$$;


--
-- Name: habitats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.habitats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    address_id uuid,
    habitat_type_id uuid,
    habitat_name text,
    description text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_inaccessible boolean DEFAULT false NOT NULL,
    metadata jsonb,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    geom public.geometry(Geometry,4326) NOT NULL,
    lat double precision,
    lng double precision,
    geojson jsonb GENERATED ALWAYS AS ((public.st_asgeojson(geom))::jsonb) STORED,
    geom_type text,
    CONSTRAINT habitats_geom_type_check CHECK ((public.geometrytype(geom) = ANY (ARRAY['POINT'::text, 'LINESTRING'::text, 'POLYGON'::text, 'MULTIPOINT'::text, 'MULTILINESTRING'::text, 'MULTIPOLYGON'::text])))
);


--
-- Name: search_document_from_habitats(public.habitats); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_document_from_habitats(r public.habitats) RETURNS public.search_documents
    LANGUAGE sql IMMUTABLE
    AS $$
	select search_document_build('habitats', r.id, r.organization_id,
		array['habitat_name'], array['description'],
		jsonb_strip_nulls(jsonb_build_object(
			'habitat_name', r.habitat_name, 'description', r.description)),
		jsonb_build_object('is_active', r.is_active::text));
$$;


--
-- Name: missions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.missions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    mission_name text,
    control_type public.control_type NOT NULL,
    planned_method_id uuid,
    assigned_to_profile_id uuid,
    assigned_by_profile_id uuid,
    scheduled_start_at timestamp with time zone NOT NULL,
    scheduled_end_at timestamp with time zone,
    rain_date date,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    cancellation_reason text,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    notification_type_id uuid,
    CONSTRAINT missions_terminal_state_exclusive CHECK (((completed_at IS NULL) OR (cancelled_at IS NULL)))
);


--
-- Name: search_document_from_missions(public.missions); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_document_from_missions(r public.missions) RETURNS public.search_documents
    LANGUAGE sql IMMUTABLE
    AS $$
	select search_document_build('missions', r.id, r.organization_id,
		array['mission_name'], array[]::text[],
		jsonb_strip_nulls(jsonb_build_object('mission_name', r.mission_name)),
		'{}'::jsonb);
$$;


--
-- Name: regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    region_folder_id uuid,
    name text NOT NULL,
    description text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    geom public.geometry(Geometry,4326) NOT NULL,
    lat double precision,
    lng double precision,
    geom_type text,
    geojson jsonb GENERATED ALWAYS AS ((public.st_asgeojson(geom))::jsonb) STORED,
    CONSTRAINT regions_geom_type_check CHECK ((public.geometrytype(geom) = ANY (ARRAY['POLYGON'::text, 'MULTIPOLYGON'::text])))
);


--
-- Name: search_document_from_regions(public.regions); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_document_from_regions(r public.regions) RETURNS public.search_documents
    LANGUAGE sql IMMUTABLE
    AS $$
	select search_document_build('regions', r.id, r.organization_id,
		array['name'], array['description'],
		jsonb_strip_nulls(jsonb_build_object('name', r.name, 'description', r.description)),
		'{}'::jsonb);
$$;


--
-- Name: requested_control_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.requested_control_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    control_type public.control_type NOT NULL,
    recommended_method_id uuid,
    summary text,
    inspection_id uuid,
    collection_id uuid,
    address_id uuid,
    requested_by_profile_id uuid,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by_profile_id uuid,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    habitat_id uuid,
    geom public.geometry(Geometry,4326) NOT NULL,
    lat double precision,
    lng double precision,
    geojson jsonb GENERATED ALWAYS AS ((public.st_asgeojson(geom))::jsonb) STORED,
    geom_type text,
    CONSTRAINT requested_control_actions_geom_type_check CHECK ((public.geometrytype(geom) = ANY (ARRAY['POINT'::text, 'LINESTRING'::text, 'POLYGON'::text, 'MULTIPOINT'::text, 'MULTILINESTRING'::text, 'MULTIPOLYGON'::text])))
);


--
-- Name: search_document_from_requested_control_actions(public.requested_control_actions); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_document_from_requested_control_actions(r public.requested_control_actions) RETURNS public.search_documents
    LANGUAGE sql IMMUTABLE
    AS $$
	select search_document_build('requested_control_actions', r.id, r.organization_id,
		array[]::text[], array['summary'],
		jsonb_strip_nulls(jsonb_build_object('summary', r.summary)),
		'{}'::jsonb);
$$;


--
-- Name: routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    route_name text NOT NULL,
    route_type public.route_type DEFAULT 'habitat'::public.route_type NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid
);


--
-- Name: search_document_from_routes(public.routes); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_document_from_routes(r public.routes) RETURNS public.search_documents
    LANGUAGE sql IMMUTABLE
    AS $$
	select search_document_build('routes', r.id, r.organization_id,
		array['route_name'], array[]::text[],
		jsonb_strip_nulls(jsonb_build_object('route_name', r.route_name)),
		jsonb_strip_nulls(jsonb_build_object('route_type', r.route_type)));
$$;


--
-- Name: samples; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.samples (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inspection_id uuid NOT NULL,
    display_name text,
    is_zero_larvae boolean DEFAULT false NOT NULL,
    has_non_mosquito boolean DEFAULT false NOT NULL,
    unidentifiable_reason text,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    organization_id uuid NOT NULL
);


--
-- Name: search_document_from_samples(public.samples); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_document_from_samples(r public.samples) RETURNS public.search_documents
    LANGUAGE sql IMMUTABLE
    AS $$
	select search_document_build('samples', r.id, r.organization_id,
		array['display_name'], array[]::text[],
		jsonb_strip_nulls(jsonb_build_object('display_name', r.display_name)),
		'{}'::jsonb);
$$;


--
-- Name: service_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    display_name integer,
    intake_type public.request_intake_type DEFAULT 'online'::public.request_intake_type NOT NULL,
    request_date date NOT NULL,
    address_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    received_by_profile_id uuid,
    details text NOT NULL,
    closed_at timestamp with time zone,
    metadata jsonb,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    closed_by_profile_id uuid,
    geom public.geometry(Point,4326) NOT NULL,
    lat double precision,
    lng double precision,
    geojson jsonb GENERATED ALWAYS AS ((public.st_asgeojson(geom))::jsonb) STORED,
    geom_type text
);


--
-- Name: search_document_from_service_requests(public.service_requests); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_document_from_service_requests(r public.service_requests) RETURNS public.search_documents
    LANGUAGE sql IMMUTABLE
    AS $$
	select search_document_build('service_requests', r.id, r.organization_id,
		array['display_name'], array['details'],
		jsonb_strip_nulls(jsonb_build_object(
			'display_name', r.display_name::text, 'details', r.details)),
		'{}'::jsonb);
$$;


--
-- Name: traps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.traps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    collection_method_id uuid NOT NULL,
    address_id uuid,
    collection_lure_id uuid,
    trap_name text,
    trap_code text,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    geom public.geometry(Point,4326) NOT NULL,
    lat double precision,
    lng double precision,
    geojson jsonb GENERATED ALWAYS AS ((public.st_asgeojson(geom))::jsonb) STORED,
    geom_type text
);


--
-- Name: search_document_from_traps(public.traps); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_document_from_traps(r public.traps) RETURNS public.search_documents
    LANGUAGE sql IMMUTABLE
    AS $$
	select search_document_build('traps', r.id, r.organization_id,
		array['trap_name', 'trap_code'], array['description'],
		jsonb_strip_nulls(jsonb_build_object(
			'trap_name', r.trap_name, 'trap_code', r.trap_code, 'description', r.description)),
		jsonb_build_object('is_active', r.is_active::text));
$$;


--
-- Name: weather_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weather_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    source_type public.weather_source_type NOT NULL,
    source_name text NOT NULL,
    source_code text,
    provider_source_id text,
    is_active boolean DEFAULT true NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    geom public.geometry(Point,4326) NOT NULL,
    lat double precision,
    lng double precision,
    geojson jsonb GENERATED ALWAYS AS ((public.st_asgeojson(geom))::jsonb) STORED,
    geom_type text,
    metadata jsonb
);


--
-- Name: search_document_from_weather_sources(public.weather_sources); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_document_from_weather_sources(r public.weather_sources) RETURNS public.search_documents
    LANGUAGE sql IMMUTABLE
    AS $$
	select search_document_build('weather_sources', r.id, r.organization_id,
		array['source_name', 'source_code'], array[]::text[],
		jsonb_strip_nulls(jsonb_build_object(
			'source_name', r.source_name, 'source_code', r.source_code)),
		jsonb_build_object('is_active', r.is_active::text));
$$;


--
-- Name: search_documents_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_documents_sync() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
declare
	doc search_documents;
begin
	if tg_op = 'DELETE' then
		delete from search_documents
			where source_table = tg_table_name and source_id = old.id;
		return old;
	end if;

	if new.deleted_at is not null then
		delete from search_documents
			where source_table = tg_table_name and source_id = new.id;
		return new;
	end if;

	-- The projection is called in `FROM`, so it expands to the seven columns
	-- `doc` holds. Selected as a bare expression it is *one* composite column,
	-- and `INTO` a row variable then quietly fills nothing.
	execute format('select d.* from search_document_from_%I($1) d', tg_table_name)
		into doc using new;

	if doc.organization_id is null then
		delete from search_documents
			where source_table = tg_table_name and source_id = new.id;
		return new;
	end if;

	insert into search_documents
		select (doc).*
		on conflict (source_table, source_id) do update set
			organization_id = excluded.organization_id,
			search_vector = excluded.search_vector,
			search_text = excluded.search_text,
			search_text_joined = excluded.search_text_joined,
			fields = excluded.fields,
			display = excluded.display;

	return new;
end;
$_$;


--
-- Name: set_owned_centroid(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_owned_centroid() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.lat := st_y(st_centroid(new.geom));
  new.lng := st_x(st_centroid(new.geom));
  new.geom_type := lower(st_geometrytype(new.geom));
  return new;
end;
$$;


--
-- Name: additional_personnel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.additional_personnel (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    personnel_profile_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid
);


--
-- Name: application_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.application_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    insecticide_batch_id uuid NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    organization_id uuid NOT NULL
);


--
-- Name: application_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.application_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    custom_schema jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid
);


--
-- Name: applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    application_method_id uuid,
    insecticide_id uuid NOT NULL,
    applicator_profile_id uuid,
    application_date date NOT NULL,
    address_id uuid,
    vehicle_id uuid,
    equipment_id uuid,
    amount_applied double precision NOT NULL,
    application_unit_id uuid NOT NULL,
    habitat_id uuid,
    collection_id uuid,
    inspection_id uuid,
    metadata jsonb,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    requested_control_action_id uuid,
    mission_item_id uuid,
    geom public.geometry(Geometry,4326) NOT NULL,
    lat double precision,
    lng double precision,
    geojson jsonb GENERATED ALWAYS AS ((public.st_asgeojson(geom))::jsonb) STORED,
    geom_type text,
    CONSTRAINT applications_amount_applied_positive CHECK ((amount_applied > (0)::double precision)),
    CONSTRAINT applications_geom_type_check CHECK ((public.geometrytype(geom) = ANY (ARRAY['POINT'::text, 'LINESTRING'::text, 'POLYGON'::text, 'MULTIPOINT'::text, 'MULTILINESTRING'::text, 'MULTIPOLYGON'::text])))
);


--
-- Name: assignment_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignment_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    "position" double precision NOT NULL,
    directions_to_next_item text,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    completed_at timestamp with time zone,
    completed_by_profile_id uuid,
    skipped_at timestamp with time zone,
    skipped_by_profile_id uuid,
    skip_reason text,
    organization_id uuid NOT NULL,
    CONSTRAINT assignment_items_progress_exclusive CHECK (((completed_at IS NULL) OR (skipped_at IS NULL)))
);


--
-- Name: biocontrol_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.biocontrol_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    biocontrol_method_id uuid NOT NULL,
    technician_profile_id uuid,
    biocontrol_date date NOT NULL,
    address_id uuid,
    habitat_id uuid,
    inspection_id uuid,
    amount_released double precision NOT NULL,
    release_unit_id uuid NOT NULL,
    metadata jsonb,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    requested_control_action_id uuid,
    mission_item_id uuid,
    geom public.geometry(Geometry,4326) NOT NULL,
    lat double precision,
    lng double precision,
    geojson jsonb GENERATED ALWAYS AS ((public.st_asgeojson(geom))::jsonb) STORED,
    geom_type text,
    CONSTRAINT biocontrol_actions_amount_released_positive CHECK ((amount_released > (0)::double precision)),
    CONSTRAINT biocontrol_actions_geom_type_check CHECK ((public.geometrytype(geom) = ANY (ARRAY['POINT'::text, 'LINESTRING'::text, 'POLYGON'::text, 'MULTIPOINT'::text, 'MULTILINESTRING'::text, 'MULTIPOLYGON'::text])))
);


--
-- Name: biocontrol_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.biocontrol_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    custom_schema jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid
);


--
-- Name: collection_lures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collection_lures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    created_by_profile_id uuid,
    updated_by_profile_id uuid
);


--
-- Name: collection_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collection_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    custom_schema jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    action_threshold integer,
    CONSTRAINT collection_methods_action_threshold_nonnegative CHECK (((action_threshold IS NULL) OR (action_threshold >= 0)))
);


--
-- Name: collection_species; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collection_species (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    collection_id uuid NOT NULL,
    species_id uuid NOT NULL,
    count integer NOT NULL,
    sex public.species_sex DEFAULT 'female'::public.species_sex,
    status public.species_status,
    identified_by_profile_id uuid,
    identified_date date NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    organization_id uuid NOT NULL,
    CONSTRAINT collection_species_count_positive CHECK ((count > 0))
);


--
-- Name: collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    trap_id uuid,
    collection_method_id uuid NOT NULL,
    collection_lure_id uuid,
    address_id uuid,
    collected_at timestamp with time zone,
    collected_by_profile_id uuid,
    started_at timestamp with time zone,
    set_by_profile_id uuid,
    has_problem boolean DEFAULT false NOT NULL,
    is_zero_result boolean DEFAULT false NOT NULL,
    has_bycatch boolean DEFAULT false NOT NULL,
    metadata jsonb,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    collection_timing_mode public.collection_timing_mode DEFAULT 'exact_timestamps'::public.collection_timing_mode NOT NULL,
    collection_date date,
    duration_amount double precision,
    duration_unit_id uuid,
    geom public.geometry(Point,4326) NOT NULL,
    lat double precision,
    lng double precision,
    geojson jsonb GENERATED ALWAYS AS ((public.st_asgeojson(geom))::jsonb) STORED,
    geom_type text,
    set_assignment_item_id uuid,
    collected_assignment_item_id uuid,
    CONSTRAINT collections_date_duration_positive CHECK (((collection_timing_mode <> 'collection_date_duration'::public.collection_timing_mode) OR (duration_amount > (0)::double precision))),
    CONSTRAINT collections_exact_timing_chronological CHECK (((collection_timing_mode <> 'exact_timestamps'::public.collection_timing_mode) OR (collected_at IS NULL) OR (started_at IS NULL) OR (collected_at >= started_at))),
    CONSTRAINT collections_timing_shape CHECK ((((collection_timing_mode = 'exact_timestamps'::public.collection_timing_mode) AND (started_at IS NOT NULL) AND (collection_date IS NULL) AND (duration_amount IS NULL) AND (duration_unit_id IS NULL)) OR ((collection_timing_mode = 'collection_date_duration'::public.collection_timing_mode) AND (started_at IS NULL) AND (collected_at IS NULL) AND (collection_date IS NOT NULL) AND (duration_amount IS NOT NULL) AND (duration_unit_id IS NOT NULL))))
);


--
-- Name: equipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    equipment_name text NOT NULL,
    serial_number text,
    metadata jsonb,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: formulation_insecticides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.formulation_insecticides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    formulation_id uuid NOT NULL,
    insecticide_id uuid NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    organization_id uuid NOT NULL,
    amount double precision NOT NULL,
    unit_id uuid NOT NULL,
    CONSTRAINT formulation_insecticides_amount_positive CHECK ((amount > (0)::double precision))
);


--
-- Name: formulations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.formulations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    formulation_name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    batch_size double precision NOT NULL,
    batch_unit_id uuid NOT NULL,
    CONSTRAINT formulations_batch_size_positive CHECK ((batch_size > (0)::double precision))
);


--
-- Name: genera; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.genera (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    abbreviation text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: habitat_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.habitat_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    custom_schema jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    created_by_profile_id uuid,
    updated_by_profile_id uuid
);


--
-- Name: insecticide_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insecticide_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    insecticide_id uuid NOT NULL,
    batch_name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    organization_id uuid NOT NULL
);


--
-- Name: insecticides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insecticides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    trade_name text NOT NULL,
    active_ingredient text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    type public.insecticide_type NOT NULL,
    registration_number text NOT NULL,
    default_unit_id uuid NOT NULL,
    inventory_unit_id uuid,
    conversion_factor double precision,
    label_url text,
    msds_url text,
    shorthand text,
    metadata jsonb,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid
);


--
-- Name: inspections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inspections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    habitat_id uuid,
    habitat_type_id uuid,
    address_id uuid,
    inspected_by_profile_id uuid,
    inspection_date date NOT NULL,
    is_wet boolean DEFAULT false NOT NULL,
    dip_count smallint,
    density public.larval_density,
    larvae_count integer,
    has_first_instar boolean DEFAULT false NOT NULL,
    has_second_instar boolean DEFAULT false NOT NULL,
    has_third_instar boolean DEFAULT false NOT NULL,
    has_fourth_instar boolean DEFAULT false NOT NULL,
    has_pupae boolean DEFAULT false NOT NULL,
    has_eggs boolean DEFAULT false NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    geom public.geometry(Geometry,4326) NOT NULL,
    lat double precision,
    lng double precision,
    geojson jsonb GENERATED ALWAYS AS ((public.st_asgeojson(geom))::jsonb) STORED,
    geom_type text,
    assignment_item_id uuid,
    CONSTRAINT inspections_dip_count_positive CHECK (((dip_count IS NULL) OR (dip_count > 0))),
    CONSTRAINT inspections_geom_type_check CHECK ((public.geometrytype(geom) = ANY (ARRAY['POINT'::text, 'LINESTRING'::text, 'POLYGON'::text, 'MULTIPOINT'::text, 'MULTILINESTRING'::text, 'MULTIPOLYGON'::text]))),
    CONSTRAINT inspections_larvae_count_nonnegative CHECK (((larvae_count IS NULL) OR (larvae_count >= 0)))
);


--
-- Name: memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid,
    profile_id uuid NOT NULL,
    role public.simmer_role NOT NULL,
    status public.membership_status DEFAULT 'active'::public.membership_status NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    invited_email text,
    workos_invitation_id text,
    CONSTRAINT memberships_user_or_invited_email_check CHECK (((user_id IS NOT NULL) OR (invited_email IS NOT NULL)))
);


--
-- Name: mission_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mission_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mission_id uuid NOT NULL,
    requested_control_action_id uuid,
    address_id uuid,
    "position" double precision NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    completed_at timestamp with time zone,
    completed_by_profile_id uuid,
    skipped_at timestamp with time zone,
    skipped_by_profile_id uuid,
    skip_reason text,
    organization_id uuid NOT NULL,
    geom public.geometry(Geometry,4326) NOT NULL,
    lat double precision,
    lng double precision,
    geojson jsonb GENERATED ALWAYS AS ((public.st_asgeojson(geom))::jsonb) STORED,
    geom_type text,
    CONSTRAINT mission_items_geom_type_check CHECK ((public.geometrytype(geom) = ANY (ARRAY['POINT'::text, 'LINESTRING'::text, 'POLYGON'::text, 'MULTIPOINT'::text, 'MULTILINESTRING'::text, 'MULTIPOLYGON'::text]))),
    CONSTRAINT mission_items_progress_exclusive CHECK (((completed_at IS NULL) OR (skipped_at IS NULL)))
);


--
-- Name: mission_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mission_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mission_id uuid NOT NULL,
    notification_registration_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    notification_type_id uuid NOT NULL,
    channel public.notification_channel NOT NULL,
    destination text,
    status public.mission_notification_status DEFAULT 'pending'::public.mission_notification_status NOT NULL,
    status_changed_at timestamp with time zone,
    status_changed_by_profile_id uuid,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    organization_id uuid NOT NULL
);


--
-- Name: notification_registration_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_registration_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    notification_registration_id uuid NOT NULL,
    notification_type_id uuid NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    organization_id uuid NOT NULL
);


--
-- Name: notification_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    address_id uuid,
    buffer_distance double precision,
    buffer_unit_id uuid,
    has_bees boolean DEFAULT false NOT NULL,
    is_no_spray boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    organization_id uuid NOT NULL,
    geom public.geometry(Geometry,4326) NOT NULL,
    lat double precision,
    lng double precision,
    geojson jsonb GENERATED ALWAYS AS ((public.st_asgeojson(geom))::jsonb) STORED,
    geom_type text,
    CONSTRAINT notification_registrations_geom_type_check CHECK ((public.geometrytype(geom) = ANY (ARRAY['POINT'::text, 'POLYGON'::text])))
);


--
-- Name: notification_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid
);


--
-- Name: organization_species; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_species (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    species_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workos_organization_id text,
    name text NOT NULL,
    slug text,
    settings jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    subscription_status public.organization_subscription_status DEFAULT 'trial'::public.organization_subscription_status NOT NULL,
    billing_mode public.organization_billing_mode DEFAULT 'manual_invoice'::public.organization_billing_mode NOT NULL,
    billing_contact_name text,
    billing_contact_email text,
    subscription_notes text,
    main_contact_email text,
    phone_number text,
    mailing_country character(2),
    mailing_address_line_1 text,
    mailing_address_line_2 text,
    mailing_locality text,
    mailing_region text,
    mailing_postal_code text,
    updated_by_profile_id uuid
);


--
-- Name: outreach_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    outreach_method_id uuid NOT NULL,
    technician_profile_id uuid,
    outreach_date date NOT NULL,
    address_id uuid,
    inspection_id uuid,
    reach integer NOT NULL,
    reach_description text,
    metadata jsonb,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    requested_control_action_id uuid,
    mission_item_id uuid,
    geom public.geometry(Geometry,4326) NOT NULL,
    lat double precision,
    lng double precision,
    geojson jsonb GENERATED ALWAYS AS ((public.st_asgeojson(geom))::jsonb) STORED,
    geom_type text,
    CONSTRAINT outreach_actions_geom_type_check CHECK ((public.geometrytype(geom) = ANY (ARRAY['POINT'::text, 'LINESTRING'::text, 'POLYGON'::text, 'MULTIPOINT'::text, 'MULTILINESTRING'::text, 'MULTIPOLYGON'::text]))),
    CONSTRAINT outreach_actions_reach_positive CHECK ((reach > 0))
);


--
-- Name: outreach_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    custom_schema jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid,
    display_name text NOT NULL,
    email text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid
);


--
-- Name: region_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.region_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    created_by_profile_id uuid,
    updated_by_profile_id uuid
);


--
-- Name: route_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.route_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    route_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    "position" double precision NOT NULL,
    directions_to_next_item text,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    organization_id uuid NOT NULL
);


--
-- Name: sample_species; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sample_species (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sample_id uuid NOT NULL,
    species_id uuid NOT NULL,
    identified_by_profile_id uuid,
    identified_at date NOT NULL,
    larvae_count integer NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    organization_id uuid NOT NULL,
    CONSTRAINT sample_species_larvae_count_positive CHECK ((larvae_count > 0))
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: source_reduction_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.source_reduction_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    custom_schema jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid
);


--
-- Name: source_reductions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.source_reductions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    source_reduction_method_id uuid NOT NULL,
    technician_profile_id uuid,
    source_reduction_date date NOT NULL,
    address_id uuid,
    sources_eliminated_amount double precision NOT NULL,
    sources_eliminated_unit_id uuid NOT NULL,
    inspection_id uuid,
    metadata jsonb,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    requested_control_action_id uuid,
    habitat_id uuid,
    mission_item_id uuid,
    geom public.geometry(Geometry,4326) NOT NULL,
    lat double precision,
    lng double precision,
    geojson jsonb GENERATED ALWAYS AS ((public.st_asgeojson(geom))::jsonb) STORED,
    geom_type text,
    CONSTRAINT source_reductions_geom_type_check CHECK ((public.geometrytype(geom) = ANY (ARRAY['POINT'::text, 'LINESTRING'::text, 'POLYGON'::text, 'MULTIPOINT'::text, 'MULTILINESTRING'::text, 'MULTIPOLYGON'::text]))),
    CONSTRAINT source_reductions_sources_eliminated_amount_positive CHECK ((sources_eliminated_amount > (0)::double precision))
);


--
-- Name: species; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.species (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    genus_id uuid,
    epithet text NOT NULL,
    common_name text,
    display_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tag_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tag_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tag_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    organization_id uuid NOT NULL
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    tag_name text NOT NULL,
    description text,
    color text,
    is_active boolean DEFAULT true NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid
);


--
-- Name: units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_name text NOT NULL,
    abbreviation text NOT NULL,
    unit_type public.unit_type NOT NULL,
    unit_system public.unit_system NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    code text NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workos_user_id text NOT NULL,
    email text NOT NULL,
    display_name text NOT NULL,
    first_name text,
    last_name text,
    email_verified boolean,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    vehicle_name text NOT NULL,
    metadata jsonb,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: weather_source_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weather_source_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    weather_source_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_profile_id uuid
);


--
-- Name: weather_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weather_summaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    weather_source_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    temperature_min_f double precision,
    temperature_max_f double precision,
    precipitation_inches double precision,
    relative_humidity_min double precision,
    relative_humidity_max double precision,
    wind_speed_min_mph double precision,
    wind_speed_max_mph double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_profile_id uuid,
    updated_by_profile_id uuid,
    organization_id uuid,
    CONSTRAINT weather_summaries_date_range_check CHECK (((end_date IS NULL) OR (end_date >= start_date))),
    CONSTRAINT weather_summaries_precipitation_bounds_check CHECK (((precipitation_inches IS NULL) OR ((precipitation_inches >= (0)::double precision) AND (precipitation_inches <= (500)::double precision)))),
    CONSTRAINT weather_summaries_relative_humidity_max_bounds_check CHECK (((relative_humidity_max IS NULL) OR ((relative_humidity_max >= (0)::double precision) AND (relative_humidity_max <= (100)::double precision)))),
    CONSTRAINT weather_summaries_relative_humidity_min_bounds_check CHECK (((relative_humidity_min IS NULL) OR ((relative_humidity_min >= (0)::double precision) AND (relative_humidity_min <= (100)::double precision)))),
    CONSTRAINT weather_summaries_relative_humidity_range_check CHECK (((relative_humidity_min IS NULL) OR (relative_humidity_max IS NULL) OR (relative_humidity_min <= relative_humidity_max))),
    CONSTRAINT weather_summaries_temperature_max_bounds_check CHECK (((temperature_max_f IS NULL) OR ((temperature_max_f >= ('-100'::integer)::double precision) AND (temperature_max_f <= (160)::double precision)))),
    CONSTRAINT weather_summaries_temperature_min_bounds_check CHECK (((temperature_min_f IS NULL) OR ((temperature_min_f >= ('-100'::integer)::double precision) AND (temperature_min_f <= (160)::double precision)))),
    CONSTRAINT weather_summaries_temperature_range_check CHECK (((temperature_min_f IS NULL) OR (temperature_max_f IS NULL) OR (temperature_min_f <= temperature_max_f))),
    CONSTRAINT weather_summaries_wind_speed_max_bounds_check CHECK (((wind_speed_max_mph IS NULL) OR ((wind_speed_max_mph >= (0)::double precision) AND (wind_speed_max_mph <= (300)::double precision)))),
    CONSTRAINT weather_summaries_wind_speed_min_bounds_check CHECK (((wind_speed_min_mph IS NULL) OR ((wind_speed_min_mph >= (0)::double precision) AND (wind_speed_min_mph <= (300)::double precision)))),
    CONSTRAINT weather_summaries_wind_speed_range_check CHECK (((wind_speed_min_mph IS NULL) OR (wind_speed_max_mph IS NULL) OR (wind_speed_min_mph <= wind_speed_max_mph)))
);


--
-- Name: additional_personnel additional_personnel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.additional_personnel
    ADD CONSTRAINT additional_personnel_pkey PRIMARY KEY (id);


--
-- Name: addresses addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_pkey PRIMARY KEY (id);


--
-- Name: application_batches application_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_batches
    ADD CONSTRAINT application_batches_pkey PRIMARY KEY (id);


--
-- Name: application_methods application_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_methods
    ADD CONSTRAINT application_methods_pkey PRIMARY KEY (id);


--
-- Name: applications applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_pkey PRIMARY KEY (id);


--
-- Name: assignment_items assignment_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_items
    ADD CONSTRAINT assignment_items_pkey PRIMARY KEY (id);


--
-- Name: assignments assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_pkey PRIMARY KEY (id);


--
-- Name: biocontrol_actions biocontrol_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biocontrol_actions
    ADD CONSTRAINT biocontrol_actions_pkey PRIMARY KEY (id);


--
-- Name: biocontrol_methods biocontrol_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biocontrol_methods
    ADD CONSTRAINT biocontrol_methods_pkey PRIMARY KEY (id);


--
-- Name: collection_lures collection_lures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_lures
    ADD CONSTRAINT collection_lures_pkey PRIMARY KEY (id);


--
-- Name: collection_methods collection_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_methods
    ADD CONSTRAINT collection_methods_pkey PRIMARY KEY (id);


--
-- Name: collection_species collection_species_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_species
    ADD CONSTRAINT collection_species_pkey PRIMARY KEY (id);


--
-- Name: collections collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: equipment equipment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment
    ADD CONSTRAINT equipment_pkey PRIMARY KEY (id);


--
-- Name: formulation_insecticides formulation_insecticides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_insecticides
    ADD CONSTRAINT formulation_insecticides_pkey PRIMARY KEY (id);


--
-- Name: formulations formulations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_pkey PRIMARY KEY (id);


--
-- Name: genera genera_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.genera
    ADD CONSTRAINT genera_pkey PRIMARY KEY (id);


--
-- Name: habitat_types habitat_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habitat_types
    ADD CONSTRAINT habitat_types_pkey PRIMARY KEY (id);


--
-- Name: habitats habitats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habitats
    ADD CONSTRAINT habitats_pkey PRIMARY KEY (id);


--
-- Name: insecticide_batches insecticide_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insecticide_batches
    ADD CONSTRAINT insecticide_batches_pkey PRIMARY KEY (id);


--
-- Name: insecticides insecticides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insecticides
    ADD CONSTRAINT insecticides_pkey PRIMARY KEY (id);


--
-- Name: inspections inspections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_pkey PRIMARY KEY (id);


--
-- Name: memberships memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (id);


--
-- Name: mission_items mission_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_items
    ADD CONSTRAINT mission_items_pkey PRIMARY KEY (id);


--
-- Name: mission_notifications mission_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_notifications
    ADD CONSTRAINT mission_notifications_pkey PRIMARY KEY (id);


--
-- Name: missions missions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.missions
    ADD CONSTRAINT missions_pkey PRIMARY KEY (id);


--
-- Name: notification_registration_types notification_registration_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_registration_types
    ADD CONSTRAINT notification_registration_types_pkey PRIMARY KEY (id);


--
-- Name: notification_registrations notification_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_registrations
    ADD CONSTRAINT notification_registrations_pkey PRIMARY KEY (id);


--
-- Name: notification_types notification_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_types
    ADD CONSTRAINT notification_types_pkey PRIMARY KEY (id);


--
-- Name: organization_species organization_species_organization_id_species_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_species
    ADD CONSTRAINT organization_species_organization_id_species_id_key UNIQUE (organization_id, species_id);


--
-- Name: organization_species organization_species_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_species
    ADD CONSTRAINT organization_species_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- Name: organizations organizations_workos_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_workos_organization_id_key UNIQUE (workos_organization_id);


--
-- Name: outreach_actions outreach_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_actions
    ADD CONSTRAINT outreach_actions_pkey PRIMARY KEY (id);


--
-- Name: outreach_methods outreach_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_methods
    ADD CONSTRAINT outreach_methods_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_organization_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_organization_id_user_id_key UNIQUE (organization_id, user_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: region_folders region_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.region_folders
    ADD CONSTRAINT region_folders_pkey PRIMARY KEY (id);


--
-- Name: regions regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_pkey PRIMARY KEY (id);


--
-- Name: requested_control_actions requested_control_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requested_control_actions
    ADD CONSTRAINT requested_control_actions_pkey PRIMARY KEY (id);


--
-- Name: route_items route_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_items
    ADD CONSTRAINT route_items_pkey PRIMARY KEY (id);


--
-- Name: routes routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_pkey PRIMARY KEY (id);


--
-- Name: sample_species sample_species_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_species
    ADD CONSTRAINT sample_species_pkey PRIMARY KEY (id);


--
-- Name: samples samples_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.samples
    ADD CONSTRAINT samples_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: search_documents search_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_documents
    ADD CONSTRAINT search_documents_pkey PRIMARY KEY (source_table, source_id);


--
-- Name: service_requests service_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_pkey PRIMARY KEY (id);


--
-- Name: source_reduction_methods source_reduction_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_reduction_methods
    ADD CONSTRAINT source_reduction_methods_pkey PRIMARY KEY (id);


--
-- Name: source_reductions source_reductions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_reductions
    ADD CONSTRAINT source_reductions_pkey PRIMARY KEY (id);


--
-- Name: species species_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.species
    ADD CONSTRAINT species_pkey PRIMARY KEY (id);


--
-- Name: tag_items tag_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_items
    ADD CONSTRAINT tag_items_pkey PRIMARY KEY (id);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: traps traps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.traps
    ADD CONSTRAINT traps_pkey PRIMARY KEY (id);


--
-- Name: units units_abbreviation_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_abbreviation_key UNIQUE (abbreviation);


--
-- Name: units units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);


--
-- Name: units units_unit_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_unit_name_key UNIQUE (unit_name);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_workos_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_workos_user_id_key UNIQUE (workos_user_id);


--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);


--
-- Name: weather_source_subscriptions weather_source_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_source_subscriptions
    ADD CONSTRAINT weather_source_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: weather_sources weather_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_sources
    ADD CONSTRAINT weather_sources_pkey PRIMARY KEY (id);


--
-- Name: weather_summaries weather_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_summaries
    ADD CONSTRAINT weather_summaries_pkey PRIMARY KEY (id);


--
-- Name: weather_summaries weather_summaries_source_range_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_summaries
    ADD CONSTRAINT weather_summaries_source_range_unique UNIQUE (weather_source_id, start_date, end_date);


--
-- Name: additional_personnel_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX additional_personnel_entity_idx ON public.additional_personnel USING btree (organization_id, entity_type, entity_id) WHERE (deleted_at IS NULL);


--
-- Name: additional_personnel_entity_personnel_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX additional_personnel_entity_personnel_unique ON public.additional_personnel USING btree (organization_id, personnel_profile_id, entity_type, entity_id) WHERE (deleted_at IS NULL);


--
-- Name: additional_personnel_personnel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX additional_personnel_personnel_idx ON public.additional_personnel USING btree (organization_id, personnel_profile_id) WHERE (deleted_at IS NULL);


--
-- Name: addresses_country_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX addresses_country_idx ON public.addresses USING btree (country);


--
-- Name: addresses_geom_gist_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX addresses_geom_gist_idx ON public.addresses USING gist (geom) WHERE (deleted_at IS NULL);


--
-- Name: addresses_organization_display_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX addresses_organization_display_name_idx ON public.addresses USING btree (organization_id, display_name) WHERE (deleted_at IS NULL);


--
-- Name: application_batches_active_application_batch_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX application_batches_active_application_batch_unique ON public.application_batches USING btree (application_id, insecticide_batch_id) WHERE (deleted_at IS NULL);


--
-- Name: application_batches_application_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX application_batches_application_idx ON public.application_batches USING btree (application_id) WHERE (deleted_at IS NULL);


--
-- Name: application_batches_insecticide_batch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX application_batches_insecticide_batch_idx ON public.application_batches USING btree (insecticide_batch_id) WHERE (deleted_at IS NULL);


--
-- Name: application_batches_organization_application_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX application_batches_organization_application_idx ON public.application_batches USING btree (organization_id, application_id) WHERE (deleted_at IS NULL);


--
-- Name: application_methods_org_active_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX application_methods_org_active_name_idx ON public.application_methods USING btree (organization_id, is_active, name) WHERE (deleted_at IS NULL);


--
-- Name: application_methods_organization_normalized_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX application_methods_organization_normalized_name_unique ON public.application_methods USING btree (organization_id, lower(btrim(name))) WHERE (deleted_at IS NULL);


--
-- Name: applications_geom_gist_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX applications_geom_gist_idx ON public.applications USING gist (geom) WHERE (deleted_at IS NULL);


--
-- Name: applications_mission_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX applications_mission_item_idx ON public.applications USING btree (mission_item_id) WHERE ((deleted_at IS NULL) AND (mission_item_id IS NOT NULL));


--
-- Name: applications_organization_address_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX applications_organization_address_idx ON public.applications USING btree (organization_id, address_id) WHERE ((deleted_at IS NULL) AND (address_id IS NOT NULL));


--
-- Name: applications_organization_collection_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX applications_organization_collection_idx ON public.applications USING btree (organization_id, collection_id) WHERE ((deleted_at IS NULL) AND (collection_id IS NOT NULL));


--
-- Name: applications_organization_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX applications_organization_date_idx ON public.applications USING btree (organization_id, application_date DESC, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: applications_organization_habitat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX applications_organization_habitat_idx ON public.applications USING btree (organization_id, habitat_id) WHERE ((deleted_at IS NULL) AND (habitat_id IS NOT NULL));


--
-- Name: applications_organization_insecticide_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX applications_organization_insecticide_idx ON public.applications USING btree (organization_id, insecticide_id) WHERE (deleted_at IS NULL);


--
-- Name: applications_organization_inspection_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX applications_organization_inspection_idx ON public.applications USING btree (organization_id, inspection_id) WHERE ((deleted_at IS NULL) AND (inspection_id IS NOT NULL));


--
-- Name: applications_organization_method_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX applications_organization_method_idx ON public.applications USING btree (organization_id, application_method_id) WHERE ((deleted_at IS NULL) AND (application_method_id IS NOT NULL));


--
-- Name: applications_requested_control_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX applications_requested_control_action_idx ON public.applications USING btree (requested_control_action_id) WHERE ((deleted_at IS NULL) AND (requested_control_action_id IS NOT NULL));


--
-- Name: assignment_items_assignment_entity_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX assignment_items_assignment_entity_unique ON public.assignment_items USING btree (assignment_id, entity_type, entity_id) WHERE (deleted_at IS NULL);


--
-- Name: assignment_items_assignment_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assignment_items_assignment_position_idx ON public.assignment_items USING btree (assignment_id, "position") WHERE (deleted_at IS NULL);


--
-- Name: assignment_items_completed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assignment_items_completed_idx ON public.assignment_items USING btree (assignment_id, completed_at) WHERE ((deleted_at IS NULL) AND (completed_at IS NOT NULL));


--
-- Name: assignment_items_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assignment_items_entity_idx ON public.assignment_items USING btree (entity_type, entity_id) WHERE (deleted_at IS NULL);


--
-- Name: assignment_items_organization_assignment_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assignment_items_organization_assignment_position_idx ON public.assignment_items USING btree (organization_id, assignment_id, "position") WHERE (deleted_at IS NULL);


--
-- Name: assignment_items_skipped_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assignment_items_skipped_idx ON public.assignment_items USING btree (assignment_id, skipped_at) WHERE ((deleted_at IS NULL) AND (skipped_at IS NOT NULL));


--
-- Name: assignments_assigned_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assignments_assigned_to_idx ON public.assignments USING btree (organization_id, assigned_to_profile_id, assignment_date DESC) WHERE ((deleted_at IS NULL) AND (assigned_to_profile_id IS NOT NULL));


--
-- Name: assignments_cancelled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assignments_cancelled_idx ON public.assignments USING btree (organization_id, cancelled_at) WHERE ((deleted_at IS NULL) AND (cancelled_at IS NOT NULL));


--
-- Name: assignments_completed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assignments_completed_idx ON public.assignments USING btree (organization_id, completed_at) WHERE ((deleted_at IS NULL) AND (completed_at IS NOT NULL));


--
-- Name: assignments_organization_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assignments_organization_date_idx ON public.assignments USING btree (organization_id, assignment_date DESC, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: assignments_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX assignments_started_idx ON public.assignments USING btree (organization_id, started_at) WHERE ((deleted_at IS NULL) AND (started_at IS NOT NULL));


--
-- Name: biocontrol_actions_geom_gist_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX biocontrol_actions_geom_gist_idx ON public.biocontrol_actions USING gist (geom) WHERE (deleted_at IS NULL);


--
-- Name: biocontrol_actions_mission_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX biocontrol_actions_mission_item_idx ON public.biocontrol_actions USING btree (mission_item_id) WHERE ((deleted_at IS NULL) AND (mission_item_id IS NOT NULL));


--
-- Name: biocontrol_actions_organization_address_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX biocontrol_actions_organization_address_idx ON public.biocontrol_actions USING btree (organization_id, address_id) WHERE ((deleted_at IS NULL) AND (address_id IS NOT NULL));


--
-- Name: biocontrol_actions_organization_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX biocontrol_actions_organization_date_idx ON public.biocontrol_actions USING btree (organization_id, biocontrol_date DESC, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: biocontrol_actions_organization_habitat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX biocontrol_actions_organization_habitat_idx ON public.biocontrol_actions USING btree (organization_id, habitat_id) WHERE ((deleted_at IS NULL) AND (habitat_id IS NOT NULL));


--
-- Name: biocontrol_actions_organization_inspection_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX biocontrol_actions_organization_inspection_idx ON public.biocontrol_actions USING btree (organization_id, inspection_id) WHERE ((deleted_at IS NULL) AND (inspection_id IS NOT NULL));


--
-- Name: biocontrol_actions_organization_method_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX biocontrol_actions_organization_method_idx ON public.biocontrol_actions USING btree (organization_id, biocontrol_method_id) WHERE (deleted_at IS NULL);


--
-- Name: biocontrol_actions_requested_control_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX biocontrol_actions_requested_control_action_idx ON public.biocontrol_actions USING btree (requested_control_action_id) WHERE ((deleted_at IS NULL) AND (requested_control_action_id IS NOT NULL));


--
-- Name: biocontrol_methods_org_active_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX biocontrol_methods_org_active_name_idx ON public.biocontrol_methods USING btree (organization_id, is_active, name) WHERE (deleted_at IS NULL);


--
-- Name: biocontrol_methods_organization_normalized_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX biocontrol_methods_organization_normalized_name_unique ON public.biocontrol_methods USING btree (organization_id, lower(btrim(name))) WHERE (deleted_at IS NULL);


--
-- Name: collection_lures_org_active_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collection_lures_org_active_name_idx ON public.collection_lures USING btree (organization_id, is_active, name) WHERE (deleted_at IS NULL);


--
-- Name: collection_lures_organization_normalized_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX collection_lures_organization_normalized_name_unique ON public.collection_lures USING btree (organization_id, lower(btrim(name))) WHERE (deleted_at IS NULL);


--
-- Name: collection_methods_org_active_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collection_methods_org_active_name_idx ON public.collection_methods USING btree (organization_id, is_active, name) WHERE (deleted_at IS NULL);


--
-- Name: collection_methods_organization_normalized_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX collection_methods_organization_normalized_name_unique ON public.collection_methods USING btree (organization_id, lower(btrim(name))) WHERE (deleted_at IS NULL);


--
-- Name: collection_species_collection_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collection_species_collection_idx ON public.collection_species USING btree (collection_id) WHERE (deleted_at IS NULL);


--
-- Name: collection_species_identified_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collection_species_identified_by_idx ON public.collection_species USING btree (identified_by_profile_id) WHERE ((deleted_at IS NULL) AND (identified_by_profile_id IS NOT NULL));


--
-- Name: collection_species_organization_collection_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collection_species_organization_collection_idx ON public.collection_species USING btree (organization_id, collection_id) WHERE (deleted_at IS NULL);


--
-- Name: collection_species_species_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collection_species_species_idx ON public.collection_species USING btree (species_id) WHERE (deleted_at IS NULL);


--
-- Name: collections_collected_assignment_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collections_collected_assignment_item_idx ON public.collections USING btree (collected_assignment_item_id);


--
-- Name: collections_duration_unit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collections_duration_unit_idx ON public.collections USING btree (duration_unit_id) WHERE ((deleted_at IS NULL) AND (duration_unit_id IS NOT NULL));


--
-- Name: collections_geom_gist_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collections_geom_gist_idx ON public.collections USING gist (geom) WHERE (deleted_at IS NULL);


--
-- Name: collections_organization_address_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collections_organization_address_idx ON public.collections USING btree (organization_id, address_id) WHERE ((deleted_at IS NULL) AND (address_id IS NOT NULL));


--
-- Name: collections_organization_collected_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collections_organization_collected_at_idx ON public.collections USING btree (organization_id, collected_at DESC NULLS LAST, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: collections_organization_collection_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collections_organization_collection_date_idx ON public.collections USING btree (organization_id, collection_date DESC, created_at DESC) WHERE ((deleted_at IS NULL) AND (collection_date IS NOT NULL));


--
-- Name: collections_organization_method_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collections_organization_method_idx ON public.collections USING btree (organization_id, collection_method_id) WHERE (deleted_at IS NULL);


--
-- Name: collections_organization_trap_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collections_organization_trap_idx ON public.collections USING btree (organization_id, trap_id) WHERE ((deleted_at IS NULL) AND (trap_id IS NOT NULL));


--
-- Name: collections_set_assignment_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collections_set_assignment_item_idx ON public.collections USING btree (set_assignment_item_id);


--
-- Name: comments_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comments_entity_idx ON public.comments USING btree (organization_id, entity_type, entity_id, commented_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: contacts_organization_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_organization_company_idx ON public.contacts USING btree (organization_id, company) WHERE ((deleted_at IS NULL) AND (company IS NOT NULL));


--
-- Name: contacts_organization_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_organization_email_idx ON public.contacts USING btree (organization_id, lower(email)) WHERE ((deleted_at IS NULL) AND (email IS NOT NULL));


--
-- Name: contacts_organization_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_organization_name_idx ON public.contacts USING btree (organization_id, contact_name) WHERE (deleted_at IS NULL);


--
-- Name: equipment_organization_active_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX equipment_organization_active_name_idx ON public.equipment USING btree (organization_id, is_active, equipment_name) WHERE (deleted_at IS NULL);


--
-- Name: equipment_organization_normalized_serial_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX equipment_organization_normalized_serial_unique ON public.equipment USING btree (organization_id, lower(btrim(serial_number))) WHERE ((deleted_at IS NULL) AND (serial_number IS NOT NULL));


--
-- Name: formulation_insecticides_active_formulation_insecticide_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX formulation_insecticides_active_formulation_insecticide_unique ON public.formulation_insecticides USING btree (formulation_id, insecticide_id) WHERE (deleted_at IS NULL);


--
-- Name: formulation_insecticides_formulation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX formulation_insecticides_formulation_idx ON public.formulation_insecticides USING btree (formulation_id) WHERE (deleted_at IS NULL);


--
-- Name: formulation_insecticides_insecticide_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX formulation_insecticides_insecticide_idx ON public.formulation_insecticides USING btree (insecticide_id) WHERE (deleted_at IS NULL);


--
-- Name: formulation_insecticides_organization_formulation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX formulation_insecticides_organization_formulation_idx ON public.formulation_insecticides USING btree (organization_id, formulation_id) WHERE (deleted_at IS NULL);


--
-- Name: formulations_organization_active_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX formulations_organization_active_name_idx ON public.formulations USING btree (organization_id, is_active, formulation_name) WHERE (deleted_at IS NULL);


--
-- Name: formulations_organization_normalized_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX formulations_organization_normalized_name_unique ON public.formulations USING btree (organization_id, lower(btrim(formulation_name))) WHERE (deleted_at IS NULL);


--
-- Name: genera_normalized_abbreviation_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX genera_normalized_abbreviation_unique ON public.genera USING btree (lower(btrim(abbreviation)));


--
-- Name: genera_normalized_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX genera_normalized_name_unique ON public.genera USING btree (lower(btrim(name)));


--
-- Name: habitat_types_org_active_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX habitat_types_org_active_name_idx ON public.habitat_types USING btree (organization_id, is_active, name) WHERE (deleted_at IS NULL);


--
-- Name: habitat_types_organization_normalized_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX habitat_types_organization_normalized_name_unique ON public.habitat_types USING btree (organization_id, lower(btrim(name))) WHERE (deleted_at IS NULL);


--
-- Name: habitats_geom_gist_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX habitats_geom_gist_idx ON public.habitats USING gist (geom) WHERE (deleted_at IS NULL);


--
-- Name: habitats_organization_active_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX habitats_organization_active_name_idx ON public.habitats USING btree (organization_id, is_active, habitat_name) WHERE (deleted_at IS NULL);


--
-- Name: habitats_organization_address_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX habitats_organization_address_idx ON public.habitats USING btree (organization_id, address_id) WHERE ((deleted_at IS NULL) AND (address_id IS NOT NULL));


--
-- Name: habitats_organization_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX habitats_organization_type_idx ON public.habitats USING btree (organization_id, habitat_type_id) WHERE ((deleted_at IS NULL) AND (habitat_type_id IS NOT NULL));


--
-- Name: insecticide_batches_insecticide_normalized_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX insecticide_batches_insecticide_normalized_name_unique ON public.insecticide_batches USING btree (insecticide_id, lower(btrim(batch_name))) WHERE (deleted_at IS NULL);


--
-- Name: insecticide_batches_organization_insecticide_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX insecticide_batches_organization_insecticide_idx ON public.insecticide_batches USING btree (organization_id, insecticide_id, is_active, batch_name) WHERE (deleted_at IS NULL);


--
-- Name: insecticides_organization_active_trade_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX insecticides_organization_active_trade_name_idx ON public.insecticides USING btree (organization_id, is_active, trade_name) WHERE (deleted_at IS NULL);


--
-- Name: insecticides_organization_normalized_identity_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX insecticides_organization_normalized_identity_unique ON public.insecticides USING btree (organization_id, lower(btrim(trade_name)), lower(btrim(registration_number))) WHERE (deleted_at IS NULL);


--
-- Name: insecticides_organization_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX insecticides_organization_type_idx ON public.insecticides USING btree (organization_id, type) WHERE (deleted_at IS NULL);


--
-- Name: inspections_assignment_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspections_assignment_item_idx ON public.inspections USING btree (assignment_item_id);


--
-- Name: inspections_geom_gist_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspections_geom_gist_idx ON public.inspections USING gist (geom) WHERE (deleted_at IS NULL);


--
-- Name: inspections_organization_address_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspections_organization_address_idx ON public.inspections USING btree (organization_id, address_id) WHERE ((deleted_at IS NULL) AND (address_id IS NOT NULL));


--
-- Name: inspections_organization_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspections_organization_date_idx ON public.inspections USING btree (organization_id, inspection_date DESC, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: inspections_organization_habitat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspections_organization_habitat_idx ON public.inspections USING btree (organization_id, habitat_id) WHERE ((deleted_at IS NULL) AND (habitat_id IS NOT NULL));


--
-- Name: inspections_organization_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspections_organization_type_idx ON public.inspections USING btree (organization_id, habitat_type_id) WHERE ((deleted_at IS NULL) AND (habitat_type_id IS NOT NULL));


--
-- Name: memberships_one_default_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX memberships_one_default_per_user ON public.memberships USING btree (user_id) WHERE (is_default AND (status = 'active'::public.membership_status));


--
-- Name: memberships_organization_invited_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX memberships_organization_invited_email_unique ON public.memberships USING btree (organization_id, lower(invited_email)) WHERE ((user_id IS NULL) AND (status = 'invited'::public.membership_status) AND (invited_email IS NOT NULL));


--
-- Name: memberships_organization_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memberships_organization_status_idx ON public.memberships USING btree (organization_id, status);


--
-- Name: memberships_organization_user_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX memberships_organization_user_unique ON public.memberships USING btree (organization_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: memberships_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memberships_user_status_idx ON public.memberships USING btree (user_id, status);


--
-- Name: mission_items_completed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mission_items_completed_idx ON public.mission_items USING btree (mission_id, completed_at) WHERE ((deleted_at IS NULL) AND (completed_at IS NOT NULL));


--
-- Name: mission_items_geom_gist_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mission_items_geom_gist_idx ON public.mission_items USING gist (geom) WHERE (deleted_at IS NULL);


--
-- Name: mission_items_mission_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mission_items_mission_position_idx ON public.mission_items USING btree (mission_id, "position") WHERE (deleted_at IS NULL);


--
-- Name: mission_items_mission_requested_control_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mission_items_mission_requested_control_action_idx ON public.mission_items USING btree (mission_id, requested_control_action_id) WHERE ((deleted_at IS NULL) AND (requested_control_action_id IS NOT NULL));


--
-- Name: mission_items_organization_address_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mission_items_organization_address_idx ON public.mission_items USING btree (organization_id, address_id) WHERE ((deleted_at IS NULL) AND (address_id IS NOT NULL));


--
-- Name: mission_items_organization_mission_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mission_items_organization_mission_position_idx ON public.mission_items USING btree (organization_id, mission_id, "position") WHERE (deleted_at IS NULL);


--
-- Name: mission_items_requested_control_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mission_items_requested_control_action_idx ON public.mission_items USING btree (requested_control_action_id) WHERE ((deleted_at IS NULL) AND (requested_control_action_id IS NOT NULL));


--
-- Name: mission_items_skipped_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mission_items_skipped_idx ON public.mission_items USING btree (mission_id, skipped_at) WHERE ((deleted_at IS NULL) AND (skipped_at IS NOT NULL));


--
-- Name: mission_notifications_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mission_notifications_contact_idx ON public.mission_notifications USING btree (contact_id) WHERE (deleted_at IS NULL);


--
-- Name: mission_notifications_mission_registration_channel_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mission_notifications_mission_registration_channel_unique ON public.mission_notifications USING btree (mission_id, notification_registration_id, channel) WHERE (deleted_at IS NULL);


--
-- Name: mission_notifications_mission_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mission_notifications_mission_status_idx ON public.mission_notifications USING btree (mission_id, status) WHERE (deleted_at IS NULL);


--
-- Name: mission_notifications_organization_mission_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mission_notifications_organization_mission_status_idx ON public.mission_notifications USING btree (organization_id, mission_id, status) WHERE (deleted_at IS NULL);


--
-- Name: mission_notifications_registration_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mission_notifications_registration_idx ON public.mission_notifications USING btree (notification_registration_id) WHERE (deleted_at IS NULL);


--
-- Name: missions_assigned_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX missions_assigned_to_idx ON public.missions USING btree (organization_id, assigned_to_profile_id, scheduled_start_at DESC) WHERE ((deleted_at IS NULL) AND (assigned_to_profile_id IS NOT NULL));


--
-- Name: missions_cancelled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX missions_cancelled_idx ON public.missions USING btree (organization_id, cancelled_at) WHERE ((deleted_at IS NULL) AND (cancelled_at IS NOT NULL));


--
-- Name: missions_completed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX missions_completed_idx ON public.missions USING btree (organization_id, completed_at) WHERE ((deleted_at IS NULL) AND (completed_at IS NOT NULL));


--
-- Name: missions_notification_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX missions_notification_type_idx ON public.missions USING btree (notification_type_id) WHERE ((deleted_at IS NULL) AND (notification_type_id IS NOT NULL));


--
-- Name: missions_organization_scheduled_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX missions_organization_scheduled_start_idx ON public.missions USING btree (organization_id, scheduled_start_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: missions_organization_type_scheduled_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX missions_organization_type_scheduled_start_idx ON public.missions USING btree (organization_id, control_type, scheduled_start_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: missions_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX missions_started_idx ON public.missions USING btree (organization_id, started_at) WHERE ((deleted_at IS NULL) AND (started_at IS NOT NULL));


--
-- Name: notification_registration_types_organization_registration_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_registration_types_organization_registration_idx ON public.notification_registration_types USING btree (organization_id, notification_registration_id) WHERE (deleted_at IS NULL);


--
-- Name: notification_registration_types_registration_type_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX notification_registration_types_registration_type_unique ON public.notification_registration_types USING btree (notification_registration_id, notification_type_id) WHERE (deleted_at IS NULL);


--
-- Name: notification_registration_types_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_registration_types_type_idx ON public.notification_registration_types USING btree (notification_type_id) WHERE (deleted_at IS NULL);


--
-- Name: notification_registrations_address_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_registrations_address_idx ON public.notification_registrations USING btree (address_id) WHERE ((deleted_at IS NULL) AND (address_id IS NOT NULL));


--
-- Name: notification_registrations_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_registrations_contact_idx ON public.notification_registrations USING btree (contact_id) WHERE (deleted_at IS NULL);


--
-- Name: notification_registrations_geom_gist_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_registrations_geom_gist_idx ON public.notification_registrations USING gist (geom) WHERE (deleted_at IS NULL);


--
-- Name: notification_registrations_organization_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_registrations_organization_contact_idx ON public.notification_registrations USING btree (organization_id, contact_id) WHERE (deleted_at IS NULL);


--
-- Name: notification_types_organization_active_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_types_organization_active_name_idx ON public.notification_types USING btree (organization_id, is_active, name) WHERE (deleted_at IS NULL);


--
-- Name: notification_types_organization_normalized_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX notification_types_organization_normalized_name_unique ON public.notification_types USING btree (organization_id, lower(btrim(name))) WHERE (deleted_at IS NULL);


--
-- Name: organization_species_org_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_species_org_active_idx ON public.organization_species USING btree (organization_id) WHERE (deleted_at IS NULL);


--
-- Name: organization_species_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_species_org_idx ON public.organization_species USING btree (organization_id);


--
-- Name: organizations_subscription_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organizations_subscription_status_idx ON public.organizations USING btree (subscription_status) WHERE (deleted_at IS NULL);


--
-- Name: outreach_actions_geom_gist_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_actions_geom_gist_idx ON public.outreach_actions USING gist (geom) WHERE (deleted_at IS NULL);


--
-- Name: outreach_actions_mission_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_actions_mission_item_idx ON public.outreach_actions USING btree (mission_item_id) WHERE ((deleted_at IS NULL) AND (mission_item_id IS NOT NULL));


--
-- Name: outreach_actions_organization_address_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_actions_organization_address_idx ON public.outreach_actions USING btree (organization_id, address_id) WHERE ((deleted_at IS NULL) AND (address_id IS NOT NULL));


--
-- Name: outreach_actions_organization_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_actions_organization_date_idx ON public.outreach_actions USING btree (organization_id, outreach_date DESC, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: outreach_actions_organization_inspection_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_actions_organization_inspection_idx ON public.outreach_actions USING btree (organization_id, inspection_id) WHERE ((deleted_at IS NULL) AND (inspection_id IS NOT NULL));


--
-- Name: outreach_actions_organization_method_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_actions_organization_method_idx ON public.outreach_actions USING btree (organization_id, outreach_method_id) WHERE (deleted_at IS NULL);


--
-- Name: outreach_actions_requested_control_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_actions_requested_control_action_idx ON public.outreach_actions USING btree (requested_control_action_id) WHERE ((deleted_at IS NULL) AND (requested_control_action_id IS NOT NULL));


--
-- Name: outreach_methods_org_active_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outreach_methods_org_active_name_idx ON public.outreach_methods USING btree (organization_id, is_active, name) WHERE (deleted_at IS NULL);


--
-- Name: outreach_methods_organization_normalized_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX outreach_methods_organization_normalized_name_unique ON public.outreach_methods USING btree (organization_id, lower(btrim(name))) WHERE (deleted_at IS NULL);


--
-- Name: profiles_organization_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_organization_active_idx ON public.profiles USING btree (organization_id, is_active);


--
-- Name: profiles_organization_pending_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profiles_organization_pending_email_unique ON public.profiles USING btree (organization_id, lower(email)) WHERE ((user_id IS NULL) AND (email IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: region_folders_organization_normalized_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX region_folders_organization_normalized_name_unique ON public.region_folders USING btree (organization_id, lower(btrim(name))) WHERE (deleted_at IS NULL);


--
-- Name: regions_geom_gist_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX regions_geom_gist_idx ON public.regions USING gist (geom) WHERE (deleted_at IS NULL);


--
-- Name: regions_organization_folder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX regions_organization_folder_idx ON public.regions USING btree (organization_id, region_folder_id) WHERE (deleted_at IS NULL);


--
-- Name: regions_organization_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX regions_organization_name_idx ON public.regions USING btree (organization_id, name) WHERE (deleted_at IS NULL);


--
-- Name: requested_control_actions_geom_gist_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX requested_control_actions_geom_gist_idx ON public.requested_control_actions USING gist (geom) WHERE (deleted_at IS NULL);


--
-- Name: requested_control_actions_organization_address_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX requested_control_actions_organization_address_idx ON public.requested_control_actions USING btree (organization_id, address_id) WHERE ((deleted_at IS NULL) AND (address_id IS NOT NULL));


--
-- Name: requested_control_actions_organization_collection_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX requested_control_actions_organization_collection_idx ON public.requested_control_actions USING btree (organization_id, collection_id) WHERE ((deleted_at IS NULL) AND (collection_id IS NOT NULL));


--
-- Name: requested_control_actions_organization_habitat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX requested_control_actions_organization_habitat_idx ON public.requested_control_actions USING btree (organization_id, habitat_id) WHERE ((deleted_at IS NULL) AND (habitat_id IS NOT NULL));


--
-- Name: requested_control_actions_organization_inspection_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX requested_control_actions_organization_inspection_idx ON public.requested_control_actions USING btree (organization_id, inspection_id) WHERE ((deleted_at IS NULL) AND (inspection_id IS NOT NULL));


--
-- Name: requested_control_actions_organization_requested_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX requested_control_actions_organization_requested_idx ON public.requested_control_actions USING btree (organization_id, requested_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: requested_control_actions_organization_resolved_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX requested_control_actions_organization_resolved_idx ON public.requested_control_actions USING btree (organization_id, resolved_at) WHERE (deleted_at IS NULL);


--
-- Name: requested_control_actions_organization_type_requested_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX requested_control_actions_organization_type_requested_idx ON public.requested_control_actions USING btree (organization_id, control_type, requested_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: route_items_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX route_items_entity_idx ON public.route_items USING btree (entity_type, entity_id) WHERE (deleted_at IS NULL);


--
-- Name: route_items_organization_route_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX route_items_organization_route_position_idx ON public.route_items USING btree (organization_id, route_id, "position") WHERE (deleted_at IS NULL);


--
-- Name: route_items_route_entity_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX route_items_route_entity_unique ON public.route_items USING btree (route_id, entity_type, entity_id) WHERE (deleted_at IS NULL);


--
-- Name: route_items_route_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX route_items_route_position_idx ON public.route_items USING btree (route_id, "position") WHERE (deleted_at IS NULL);


--
-- Name: routes_organization_normalized_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX routes_organization_normalized_name_unique ON public.routes USING btree (organization_id, lower(btrim(route_name))) WHERE (deleted_at IS NULL);


--
-- Name: routes_organization_type_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX routes_organization_type_name_idx ON public.routes USING btree (organization_id, route_type, route_name) WHERE (deleted_at IS NULL);


--
-- Name: sample_species_active_sample_species_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sample_species_active_sample_species_unique ON public.sample_species USING btree (sample_id, species_id) WHERE (deleted_at IS NULL);


--
-- Name: sample_species_identified_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sample_species_identified_by_idx ON public.sample_species USING btree (identified_by_profile_id) WHERE ((deleted_at IS NULL) AND (identified_by_profile_id IS NOT NULL));


--
-- Name: sample_species_organization_sample_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sample_species_organization_sample_idx ON public.sample_species USING btree (organization_id, sample_id) WHERE (deleted_at IS NULL);


--
-- Name: sample_species_sample_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sample_species_sample_idx ON public.sample_species USING btree (sample_id) WHERE (deleted_at IS NULL);


--
-- Name: sample_species_species_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sample_species_species_idx ON public.sample_species USING btree (species_id) WHERE (deleted_at IS NULL);


--
-- Name: samples_inspection_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX samples_inspection_idx ON public.samples USING btree (inspection_id) WHERE (deleted_at IS NULL);


--
-- Name: samples_organization_inspection_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX samples_organization_inspection_idx ON public.samples USING btree (organization_id, inspection_id) WHERE (deleted_at IS NULL);


--
-- Name: search_documents_text_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX search_documents_text_idx ON public.search_documents USING gin (organization_id, search_text);


--
-- Name: search_documents_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX search_documents_trgm_idx ON public.search_documents USING gin (organization_id, search_text_joined public.gin_trgm_ops);


--
-- Name: search_documents_vector_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX search_documents_vector_idx ON public.search_documents USING gin (organization_id, search_vector);


--
-- Name: service_requests_closed_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_requests_closed_by_idx ON public.service_requests USING btree (organization_id, closed_by_profile_id) WHERE ((deleted_at IS NULL) AND (closed_by_profile_id IS NOT NULL));


--
-- Name: service_requests_geom_gist_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_requests_geom_gist_idx ON public.service_requests USING gist (geom) WHERE (deleted_at IS NULL);


--
-- Name: service_requests_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_requests_open_idx ON public.service_requests USING btree (organization_id, request_date DESC, created_at DESC) WHERE ((deleted_at IS NULL) AND (closed_at IS NULL));


--
-- Name: service_requests_organization_address_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_requests_organization_address_idx ON public.service_requests USING btree (organization_id, address_id) WHERE (deleted_at IS NULL);


--
-- Name: service_requests_organization_contact_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_requests_organization_contact_idx ON public.service_requests USING btree (organization_id, contact_id) WHERE (deleted_at IS NULL);


--
-- Name: service_requests_organization_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_requests_organization_date_idx ON public.service_requests USING btree (organization_id, request_date DESC, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: service_requests_organization_display_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX service_requests_organization_display_name_unique ON public.service_requests USING btree (organization_id, display_name) WHERE ((deleted_at IS NULL) AND (display_name IS NOT NULL));


--
-- Name: source_reduction_methods_org_active_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX source_reduction_methods_org_active_name_idx ON public.source_reduction_methods USING btree (organization_id, is_active, name) WHERE (deleted_at IS NULL);


--
-- Name: source_reduction_methods_organization_normalized_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX source_reduction_methods_organization_normalized_name_unique ON public.source_reduction_methods USING btree (organization_id, lower(btrim(name))) WHERE (deleted_at IS NULL);


--
-- Name: source_reductions_geom_gist_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX source_reductions_geom_gist_idx ON public.source_reductions USING gist (geom) WHERE (deleted_at IS NULL);


--
-- Name: source_reductions_mission_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX source_reductions_mission_item_idx ON public.source_reductions USING btree (mission_item_id) WHERE ((deleted_at IS NULL) AND (mission_item_id IS NOT NULL));


--
-- Name: source_reductions_organization_address_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX source_reductions_organization_address_idx ON public.source_reductions USING btree (organization_id, address_id) WHERE ((deleted_at IS NULL) AND (address_id IS NOT NULL));


--
-- Name: source_reductions_organization_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX source_reductions_organization_date_idx ON public.source_reductions USING btree (organization_id, source_reduction_date DESC, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: source_reductions_organization_habitat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX source_reductions_organization_habitat_idx ON public.source_reductions USING btree (organization_id, habitat_id) WHERE ((deleted_at IS NULL) AND (habitat_id IS NOT NULL));


--
-- Name: source_reductions_organization_inspection_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX source_reductions_organization_inspection_idx ON public.source_reductions USING btree (organization_id, inspection_id) WHERE ((deleted_at IS NULL) AND (inspection_id IS NOT NULL));


--
-- Name: source_reductions_organization_method_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX source_reductions_organization_method_idx ON public.source_reductions USING btree (organization_id, source_reduction_method_id) WHERE (deleted_at IS NULL);


--
-- Name: source_reductions_requested_control_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX source_reductions_requested_control_action_idx ON public.source_reductions USING btree (requested_control_action_id) WHERE ((deleted_at IS NULL) AND (requested_control_action_id IS NOT NULL));


--
-- Name: species_genus_normalized_epithet_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX species_genus_normalized_epithet_unique ON public.species USING btree (genus_id, lower(btrim(epithet))) WHERE (genus_id IS NOT NULL);


--
-- Name: species_special_normalized_epithet_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX species_special_normalized_epithet_unique ON public.species USING btree (lower(btrim(epithet))) WHERE (genus_id IS NULL);


--
-- Name: tag_items_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tag_items_entity_idx ON public.tag_items USING btree (entity_type, entity_id) WHERE (deleted_at IS NULL);


--
-- Name: tag_items_organization_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tag_items_organization_entity_idx ON public.tag_items USING btree (organization_id, entity_type, entity_id) WHERE (deleted_at IS NULL);


--
-- Name: tag_items_tag_entity_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tag_items_tag_entity_unique ON public.tag_items USING btree (tag_id, entity_type, entity_id) WHERE (deleted_at IS NULL);


--
-- Name: tag_items_tag_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tag_items_tag_idx ON public.tag_items USING btree (tag_id) WHERE (deleted_at IS NULL);


--
-- Name: tags_organization_active_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tags_organization_active_name_idx ON public.tags USING btree (organization_id, is_active, tag_name) WHERE (deleted_at IS NULL);


--
-- Name: tags_organization_normalized_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tags_organization_normalized_name_unique ON public.tags USING btree (organization_id, lower(btrim(tag_name))) WHERE (deleted_at IS NULL);


--
-- Name: traps_geom_gist_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX traps_geom_gist_idx ON public.traps USING gist (geom) WHERE (deleted_at IS NULL);


--
-- Name: traps_organization_active_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX traps_organization_active_name_idx ON public.traps USING btree (organization_id, is_active, trap_name) WHERE (deleted_at IS NULL);


--
-- Name: traps_organization_address_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX traps_organization_address_idx ON public.traps USING btree (organization_id, address_id) WHERE ((deleted_at IS NULL) AND (address_id IS NOT NULL));


--
-- Name: traps_organization_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX traps_organization_code_idx ON public.traps USING btree (organization_id, trap_code) WHERE ((deleted_at IS NULL) AND (trap_code IS NOT NULL));


--
-- Name: traps_organization_method_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX traps_organization_method_idx ON public.traps USING btree (organization_id, collection_method_id) WHERE (deleted_at IS NULL);


--
-- Name: units_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX units_code_unique ON public.units USING btree (code);


--
-- Name: vehicles_organization_active_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vehicles_organization_active_name_idx ON public.vehicles USING btree (organization_id, is_active, vehicle_name) WHERE (deleted_at IS NULL);


--
-- Name: weather_source_subscriptions_organization_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX weather_source_subscriptions_organization_active_idx ON public.weather_source_subscriptions USING btree (organization_id, is_active) WHERE (deleted_at IS NULL);


--
-- Name: weather_source_subscriptions_organization_source_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX weather_source_subscriptions_organization_source_unique ON public.weather_source_subscriptions USING btree (organization_id, weather_source_id) WHERE (deleted_at IS NULL);


--
-- Name: weather_source_subscriptions_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX weather_source_subscriptions_source_idx ON public.weather_source_subscriptions USING btree (weather_source_id) WHERE (deleted_at IS NULL);


--
-- Name: weather_sources_geom_gist_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX weather_sources_geom_gist_idx ON public.weather_sources USING gist (geom) WHERE (deleted_at IS NULL);


--
-- Name: weather_sources_organization_normalized_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX weather_sources_organization_normalized_code_unique ON public.weather_sources USING btree (organization_id, lower(TRIM(BOTH FROM source_code))) WHERE ((deleted_at IS NULL) AND (source_code IS NOT NULL));


--
-- Name: weather_sources_organization_normalized_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX weather_sources_organization_normalized_name_unique ON public.weather_sources USING btree (organization_id, lower(TRIM(BOTH FROM source_name))) WHERE (deleted_at IS NULL);


--
-- Name: weather_sources_organization_type_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX weather_sources_organization_type_name_idx ON public.weather_sources USING btree (organization_id, source_type, source_name) WHERE (deleted_at IS NULL);


--
-- Name: weather_sources_type_provider_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX weather_sources_type_provider_source_idx ON public.weather_sources USING btree (source_type, provider_source_id) WHERE ((deleted_at IS NULL) AND (provider_source_id IS NOT NULL));


--
-- Name: weather_summaries_organization_source_start_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX weather_summaries_organization_source_start_date_idx ON public.weather_summaries USING btree (organization_id, weather_source_id, start_date DESC) WHERE (organization_id IS NOT NULL);


--
-- Name: weather_summaries_source_start_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX weather_summaries_source_start_date_idx ON public.weather_summaries USING btree (weather_source_id, start_date DESC);


--
-- Name: addresses addresses_centroid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER addresses_centroid BEFORE INSERT OR UPDATE OF geom ON public.addresses FOR EACH ROW EXECUTE FUNCTION public.set_owned_centroid();


--
-- Name: addresses addresses_search_document_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER addresses_search_document_update AFTER UPDATE ON public.addresses FOR EACH ROW WHEN (((old.display_name IS DISTINCT FROM new.display_name) OR (old.locality IS DISTINCT FROM new.locality) OR (old.postal_code IS DISTINCT FROM new.postal_code) OR (old.deleted_at IS DISTINCT FROM new.deleted_at))) EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: addresses addresses_search_document_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER addresses_search_document_write AFTER INSERT OR DELETE ON public.addresses FOR EACH ROW EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: applications applications_centroid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER applications_centroid BEFORE INSERT OR UPDATE OF geom ON public.applications FOR EACH ROW EXECUTE FUNCTION public.set_owned_centroid();


--
-- Name: assignments assignments_search_document_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER assignments_search_document_update AFTER UPDATE ON public.assignments FOR EACH ROW WHEN (((old.assignment_name IS DISTINCT FROM new.assignment_name) OR (old.deleted_at IS DISTINCT FROM new.deleted_at))) EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: assignments assignments_search_document_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER assignments_search_document_write AFTER INSERT OR DELETE ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: biocontrol_actions biocontrol_actions_centroid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER biocontrol_actions_centroid BEFORE INSERT OR UPDATE OF geom ON public.biocontrol_actions FOR EACH ROW EXECUTE FUNCTION public.set_owned_centroid();


--
-- Name: collections collections_centroid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER collections_centroid BEFORE INSERT OR UPDATE OF geom ON public.collections FOR EACH ROW EXECUTE FUNCTION public.set_owned_centroid();


--
-- Name: comments comments_search_document_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER comments_search_document_update AFTER UPDATE ON public.comments FOR EACH ROW WHEN (((old.comment_text IS DISTINCT FROM new.comment_text) OR (old.entity_type IS DISTINCT FROM new.entity_type) OR (old.entity_id IS DISTINCT FROM new.entity_id) OR (old.deleted_at IS DISTINCT FROM new.deleted_at))) EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: comments comments_search_document_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER comments_search_document_write AFTER INSERT OR DELETE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: contacts contacts_search_document_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER contacts_search_document_update AFTER UPDATE ON public.contacts FOR EACH ROW WHEN (((old.contact_name IS DISTINCT FROM new.contact_name) OR (old.company IS DISTINCT FROM new.company) OR (old.email IS DISTINCT FROM new.email) OR (old.preferred_phone IS DISTINCT FROM new.preferred_phone) OR (old.alternate_phone IS DISTINCT FROM new.alternate_phone) OR (old.deleted_at IS DISTINCT FROM new.deleted_at))) EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: contacts contacts_search_document_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER contacts_search_document_write AFTER INSERT OR DELETE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: habitats habitats_centroid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER habitats_centroid BEFORE INSERT OR UPDATE OF geom ON public.habitats FOR EACH ROW EXECUTE FUNCTION public.set_owned_centroid();


--
-- Name: habitats habitats_search_document_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER habitats_search_document_update AFTER UPDATE ON public.habitats FOR EACH ROW WHEN (((old.habitat_name IS DISTINCT FROM new.habitat_name) OR (old.description IS DISTINCT FROM new.description) OR (old.is_active IS DISTINCT FROM new.is_active) OR (old.deleted_at IS DISTINCT FROM new.deleted_at))) EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: habitats habitats_search_document_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER habitats_search_document_write AFTER INSERT OR DELETE ON public.habitats FOR EACH ROW EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: inspections inspections_centroid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inspections_centroid BEFORE INSERT OR UPDATE OF geom ON public.inspections FOR EACH ROW EXECUTE FUNCTION public.set_owned_centroid();


--
-- Name: mission_items mission_items_centroid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mission_items_centroid BEFORE INSERT OR UPDATE OF geom ON public.mission_items FOR EACH ROW EXECUTE FUNCTION public.set_owned_centroid();


--
-- Name: missions missions_search_document_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER missions_search_document_update AFTER UPDATE ON public.missions FOR EACH ROW WHEN (((old.mission_name IS DISTINCT FROM new.mission_name) OR (old.deleted_at IS DISTINCT FROM new.deleted_at))) EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: missions missions_search_document_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER missions_search_document_write AFTER INSERT OR DELETE ON public.missions FOR EACH ROW EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: notification_registrations notification_registrations_centroid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notification_registrations_centroid BEFORE INSERT OR UPDATE OF geom ON public.notification_registrations FOR EACH ROW EXECUTE FUNCTION public.set_owned_centroid();


--
-- Name: outreach_actions outreach_actions_centroid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER outreach_actions_centroid BEFORE INSERT OR UPDATE OF geom ON public.outreach_actions FOR EACH ROW EXECUTE FUNCTION public.set_owned_centroid();


--
-- Name: regions regions_centroid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER regions_centroid BEFORE INSERT OR UPDATE OF geom ON public.regions FOR EACH ROW EXECUTE FUNCTION public.set_owned_centroid();


--
-- Name: regions regions_search_document_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER regions_search_document_update AFTER UPDATE ON public.regions FOR EACH ROW WHEN (((old.name IS DISTINCT FROM new.name) OR (old.description IS DISTINCT FROM new.description) OR (old.deleted_at IS DISTINCT FROM new.deleted_at))) EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: regions regions_search_document_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER regions_search_document_write AFTER INSERT OR DELETE ON public.regions FOR EACH ROW EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: requested_control_actions requested_control_actions_centroid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER requested_control_actions_centroid BEFORE INSERT OR UPDATE OF geom ON public.requested_control_actions FOR EACH ROW EXECUTE FUNCTION public.set_owned_centroid();


--
-- Name: requested_control_actions requested_control_actions_search_document_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER requested_control_actions_search_document_update AFTER UPDATE ON public.requested_control_actions FOR EACH ROW WHEN (((old.summary IS DISTINCT FROM new.summary) OR (old.deleted_at IS DISTINCT FROM new.deleted_at))) EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: requested_control_actions requested_control_actions_search_document_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER requested_control_actions_search_document_write AFTER INSERT OR DELETE ON public.requested_control_actions FOR EACH ROW EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: routes routes_search_document_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER routes_search_document_update AFTER UPDATE ON public.routes FOR EACH ROW WHEN (((old.route_name IS DISTINCT FROM new.route_name) OR (old.route_type IS DISTINCT FROM new.route_type) OR (old.deleted_at IS DISTINCT FROM new.deleted_at))) EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: routes routes_search_document_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER routes_search_document_write AFTER INSERT OR DELETE ON public.routes FOR EACH ROW EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: samples samples_search_document_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER samples_search_document_update AFTER UPDATE ON public.samples FOR EACH ROW WHEN (((old.display_name IS DISTINCT FROM new.display_name) OR (old.deleted_at IS DISTINCT FROM new.deleted_at))) EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: samples samples_search_document_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER samples_search_document_write AFTER INSERT OR DELETE ON public.samples FOR EACH ROW EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: service_requests service_requests_centroid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER service_requests_centroid BEFORE INSERT OR UPDATE OF geom ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.set_owned_centroid();


--
-- Name: service_requests service_requests_search_document_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER service_requests_search_document_update AFTER UPDATE ON public.service_requests FOR EACH ROW WHEN (((old.display_name IS DISTINCT FROM new.display_name) OR (old.details IS DISTINCT FROM new.details) OR (old.deleted_at IS DISTINCT FROM new.deleted_at))) EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: service_requests service_requests_search_document_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER service_requests_search_document_write AFTER INSERT OR DELETE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: source_reductions source_reductions_centroid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER source_reductions_centroid BEFORE INSERT OR UPDATE OF geom ON public.source_reductions FOR EACH ROW EXECUTE FUNCTION public.set_owned_centroid();


--
-- Name: traps traps_centroid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER traps_centroid BEFORE INSERT OR UPDATE OF geom ON public.traps FOR EACH ROW EXECUTE FUNCTION public.set_owned_centroid();


--
-- Name: traps traps_search_document_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER traps_search_document_update AFTER UPDATE ON public.traps FOR EACH ROW WHEN (((old.trap_name IS DISTINCT FROM new.trap_name) OR (old.trap_code IS DISTINCT FROM new.trap_code) OR (old.description IS DISTINCT FROM new.description) OR (old.is_active IS DISTINCT FROM new.is_active) OR (old.deleted_at IS DISTINCT FROM new.deleted_at))) EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: traps traps_search_document_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER traps_search_document_write AFTER INSERT OR DELETE ON public.traps FOR EACH ROW EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: weather_sources weather_sources_centroid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER weather_sources_centroid BEFORE INSERT OR UPDATE OF geom ON public.weather_sources FOR EACH ROW EXECUTE FUNCTION public.set_owned_centroid();


--
-- Name: weather_sources weather_sources_search_document_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER weather_sources_search_document_update AFTER UPDATE ON public.weather_sources FOR EACH ROW WHEN (((old.source_name IS DISTINCT FROM new.source_name) OR (old.source_code IS DISTINCT FROM new.source_code) OR (old.organization_id IS DISTINCT FROM new.organization_id) OR (old.is_active IS DISTINCT FROM new.is_active) OR (old.deleted_at IS DISTINCT FROM new.deleted_at))) EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: weather_sources weather_sources_search_document_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER weather_sources_search_document_write AFTER INSERT OR DELETE ON public.weather_sources FOR EACH ROW EXECUTE FUNCTION public.search_documents_sync();


--
-- Name: additional_personnel additional_personnel_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.additional_personnel
    ADD CONSTRAINT additional_personnel_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: additional_personnel additional_personnel_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.additional_personnel
    ADD CONSTRAINT additional_personnel_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: additional_personnel additional_personnel_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.additional_personnel
    ADD CONSTRAINT additional_personnel_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: additional_personnel additional_personnel_personnel_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.additional_personnel
    ADD CONSTRAINT additional_personnel_personnel_profile_id_fkey FOREIGN KEY (personnel_profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: additional_personnel additional_personnel_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.additional_personnel
    ADD CONSTRAINT additional_personnel_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: addresses addresses_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: addresses addresses_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: addresses addresses_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: addresses addresses_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: application_batches application_batches_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_batches
    ADD CONSTRAINT application_batches_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;


--
-- Name: application_batches application_batches_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_batches
    ADD CONSTRAINT application_batches_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: application_batches application_batches_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_batches
    ADD CONSTRAINT application_batches_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: application_batches application_batches_insecticide_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_batches
    ADD CONSTRAINT application_batches_insecticide_batch_id_fkey FOREIGN KEY (insecticide_batch_id) REFERENCES public.insecticide_batches(id) ON DELETE CASCADE;


--
-- Name: application_batches application_batches_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_batches
    ADD CONSTRAINT application_batches_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: application_batches application_batches_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_batches
    ADD CONSTRAINT application_batches_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: application_methods application_methods_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_methods
    ADD CONSTRAINT application_methods_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: application_methods application_methods_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_methods
    ADD CONSTRAINT application_methods_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: application_methods application_methods_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_methods
    ADD CONSTRAINT application_methods_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: application_methods application_methods_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_methods
    ADD CONSTRAINT application_methods_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: applications applications_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_address_id_fkey FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON DELETE RESTRICT;


--
-- Name: applications applications_application_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_application_method_id_fkey FOREIGN KEY (application_method_id) REFERENCES public.application_methods(id) ON DELETE SET NULL;


--
-- Name: applications applications_application_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_application_unit_id_fkey FOREIGN KEY (application_unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- Name: applications applications_applicator_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_applicator_profile_id_fkey FOREIGN KEY (applicator_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: applications applications_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON DELETE SET NULL;


--
-- Name: applications applications_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: applications applications_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: applications applications_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id) ON DELETE SET NULL;


--
-- Name: applications applications_habitat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_habitat_id_fkey FOREIGN KEY (habitat_id) REFERENCES public.habitats(id) ON DELETE SET NULL;


--
-- Name: applications applications_insecticide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_insecticide_id_fkey FOREIGN KEY (insecticide_id) REFERENCES public.insecticides(id) ON DELETE RESTRICT;


--
-- Name: applications applications_inspection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.inspections(id) ON DELETE SET NULL;


--
-- Name: applications applications_mission_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_mission_item_id_fkey FOREIGN KEY (mission_item_id) REFERENCES public.mission_items(id) ON DELETE SET NULL;


--
-- Name: applications applications_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: applications applications_requested_control_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_requested_control_action_id_fkey FOREIGN KEY (requested_control_action_id) REFERENCES public.requested_control_actions(id) ON DELETE SET NULL;


--
-- Name: applications applications_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: applications applications_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;


--
-- Name: assignment_items assignment_items_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_items
    ADD CONSTRAINT assignment_items_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE;


--
-- Name: assignment_items assignment_items_completed_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_items
    ADD CONSTRAINT assignment_items_completed_by_profile_id_fkey FOREIGN KEY (completed_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: assignment_items assignment_items_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_items
    ADD CONSTRAINT assignment_items_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: assignment_items assignment_items_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_items
    ADD CONSTRAINT assignment_items_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: assignment_items assignment_items_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_items
    ADD CONSTRAINT assignment_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: assignment_items assignment_items_skipped_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_items
    ADD CONSTRAINT assignment_items_skipped_by_profile_id_fkey FOREIGN KEY (skipped_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: assignment_items assignment_items_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_items
    ADD CONSTRAINT assignment_items_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: assignments assignments_assigned_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_assigned_by_profile_id_fkey FOREIGN KEY (assigned_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: assignments assignments_assigned_to_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_assigned_to_profile_id_fkey FOREIGN KEY (assigned_to_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: assignments assignments_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: assignments assignments_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: assignments assignments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: assignments assignments_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: biocontrol_actions biocontrol_actions_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biocontrol_actions
    ADD CONSTRAINT biocontrol_actions_address_id_fkey FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON DELETE RESTRICT;


--
-- Name: biocontrol_actions biocontrol_actions_biocontrol_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biocontrol_actions
    ADD CONSTRAINT biocontrol_actions_biocontrol_method_id_fkey FOREIGN KEY (biocontrol_method_id) REFERENCES public.biocontrol_methods(id) ON DELETE RESTRICT;


--
-- Name: biocontrol_actions biocontrol_actions_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biocontrol_actions
    ADD CONSTRAINT biocontrol_actions_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: biocontrol_actions biocontrol_actions_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biocontrol_actions
    ADD CONSTRAINT biocontrol_actions_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: biocontrol_actions biocontrol_actions_habitat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biocontrol_actions
    ADD CONSTRAINT biocontrol_actions_habitat_id_fkey FOREIGN KEY (habitat_id) REFERENCES public.habitats(id) ON DELETE SET NULL;


--
-- Name: biocontrol_actions biocontrol_actions_inspection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biocontrol_actions
    ADD CONSTRAINT biocontrol_actions_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.inspections(id) ON DELETE SET NULL;


--
-- Name: biocontrol_actions biocontrol_actions_mission_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biocontrol_actions
    ADD CONSTRAINT biocontrol_actions_mission_item_id_fkey FOREIGN KEY (mission_item_id) REFERENCES public.mission_items(id) ON DELETE SET NULL;


--
-- Name: biocontrol_actions biocontrol_actions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biocontrol_actions
    ADD CONSTRAINT biocontrol_actions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: biocontrol_actions biocontrol_actions_release_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biocontrol_actions
    ADD CONSTRAINT biocontrol_actions_release_unit_id_fkey FOREIGN KEY (release_unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- Name: biocontrol_actions biocontrol_actions_requested_control_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biocontrol_actions
    ADD CONSTRAINT biocontrol_actions_requested_control_action_id_fkey FOREIGN KEY (requested_control_action_id) REFERENCES public.requested_control_actions(id) ON DELETE SET NULL;


--
-- Name: biocontrol_actions biocontrol_actions_technician_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biocontrol_actions
    ADD CONSTRAINT biocontrol_actions_technician_profile_id_fkey FOREIGN KEY (technician_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: biocontrol_actions biocontrol_actions_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biocontrol_actions
    ADD CONSTRAINT biocontrol_actions_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: biocontrol_methods biocontrol_methods_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biocontrol_methods
    ADD CONSTRAINT biocontrol_methods_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: biocontrol_methods biocontrol_methods_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biocontrol_methods
    ADD CONSTRAINT biocontrol_methods_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: biocontrol_methods biocontrol_methods_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biocontrol_methods
    ADD CONSTRAINT biocontrol_methods_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: biocontrol_methods biocontrol_methods_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.biocontrol_methods
    ADD CONSTRAINT biocontrol_methods_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: collection_lures collection_lures_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_lures
    ADD CONSTRAINT collection_lures_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: collection_lures collection_lures_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_lures
    ADD CONSTRAINT collection_lures_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: collection_lures collection_lures_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_lures
    ADD CONSTRAINT collection_lures_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: collection_lures collection_lures_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_lures
    ADD CONSTRAINT collection_lures_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: collection_methods collection_methods_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_methods
    ADD CONSTRAINT collection_methods_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: collection_methods collection_methods_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_methods
    ADD CONSTRAINT collection_methods_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: collection_methods collection_methods_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_methods
    ADD CONSTRAINT collection_methods_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: collection_methods collection_methods_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_methods
    ADD CONSTRAINT collection_methods_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: collection_species collection_species_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_species
    ADD CONSTRAINT collection_species_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON DELETE CASCADE;


--
-- Name: collection_species collection_species_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_species
    ADD CONSTRAINT collection_species_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: collection_species collection_species_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_species
    ADD CONSTRAINT collection_species_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: collection_species collection_species_identified_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_species
    ADD CONSTRAINT collection_species_identified_by_profile_id_fkey FOREIGN KEY (identified_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: collection_species collection_species_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_species
    ADD CONSTRAINT collection_species_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: collection_species collection_species_species_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_species
    ADD CONSTRAINT collection_species_species_id_fkey FOREIGN KEY (species_id) REFERENCES public.species(id) ON DELETE RESTRICT;


--
-- Name: collection_species collection_species_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_species
    ADD CONSTRAINT collection_species_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: collections collections_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_address_id_fkey FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON DELETE RESTRICT;


--
-- Name: collections collections_collected_assignment_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_collected_assignment_item_id_fkey FOREIGN KEY (collected_assignment_item_id) REFERENCES public.assignment_items(id) ON DELETE SET NULL;


--
-- Name: collections collections_collected_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_collected_by_profile_id_fkey FOREIGN KEY (collected_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: collections collections_collection_lure_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_collection_lure_id_fkey FOREIGN KEY (collection_lure_id) REFERENCES public.collection_lures(id) ON DELETE SET NULL;


--
-- Name: collections collections_collection_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_collection_method_id_fkey FOREIGN KEY (collection_method_id) REFERENCES public.collection_methods(id) ON DELETE RESTRICT;


--
-- Name: collections collections_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: collections collections_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: collections collections_duration_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_duration_unit_id_fkey FOREIGN KEY (duration_unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- Name: collections collections_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: collections collections_set_assignment_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_set_assignment_item_id_fkey FOREIGN KEY (set_assignment_item_id) REFERENCES public.assignment_items(id) ON DELETE SET NULL;


--
-- Name: collections collections_set_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_set_by_profile_id_fkey FOREIGN KEY (set_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: collections collections_trap_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_trap_id_fkey FOREIGN KEY (trap_id) REFERENCES public.traps(id) ON DELETE SET NULL;


--
-- Name: collections collections_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: comments comments_commented_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_commented_by_profile_id_fkey FOREIGN KEY (commented_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: comments comments_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: comments comments_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: comments comments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: comments comments_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: contacts contacts_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: equipment equipment_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment
    ADD CONSTRAINT equipment_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: equipment equipment_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment
    ADD CONSTRAINT equipment_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: equipment equipment_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment
    ADD CONSTRAINT equipment_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: equipment equipment_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment
    ADD CONSTRAINT equipment_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: formulation_insecticides formulation_insecticides_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_insecticides
    ADD CONSTRAINT formulation_insecticides_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: formulation_insecticides formulation_insecticides_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_insecticides
    ADD CONSTRAINT formulation_insecticides_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: formulation_insecticides formulation_insecticides_formulation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_insecticides
    ADD CONSTRAINT formulation_insecticides_formulation_id_fkey FOREIGN KEY (formulation_id) REFERENCES public.formulations(id) ON DELETE CASCADE;


--
-- Name: formulation_insecticides formulation_insecticides_insecticide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_insecticides
    ADD CONSTRAINT formulation_insecticides_insecticide_id_fkey FOREIGN KEY (insecticide_id) REFERENCES public.insecticides(id) ON DELETE RESTRICT;


--
-- Name: formulation_insecticides formulation_insecticides_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_insecticides
    ADD CONSTRAINT formulation_insecticides_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: formulation_insecticides formulation_insecticides_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_insecticides
    ADD CONSTRAINT formulation_insecticides_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- Name: formulation_insecticides formulation_insecticides_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_insecticides
    ADD CONSTRAINT formulation_insecticides_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: formulations formulations_batch_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_batch_unit_id_fkey FOREIGN KEY (batch_unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- Name: formulations formulations_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: formulations formulations_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: formulations formulations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: formulations formulations_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: habitat_types habitat_types_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habitat_types
    ADD CONSTRAINT habitat_types_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: habitat_types habitat_types_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habitat_types
    ADD CONSTRAINT habitat_types_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: habitat_types habitat_types_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habitat_types
    ADD CONSTRAINT habitat_types_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: habitat_types habitat_types_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habitat_types
    ADD CONSTRAINT habitat_types_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: habitats habitats_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habitats
    ADD CONSTRAINT habitats_address_id_fkey FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON DELETE RESTRICT;


--
-- Name: habitats habitats_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habitats
    ADD CONSTRAINT habitats_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: habitats habitats_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habitats
    ADD CONSTRAINT habitats_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: habitats habitats_habitat_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habitats
    ADD CONSTRAINT habitats_habitat_type_id_fkey FOREIGN KEY (habitat_type_id) REFERENCES public.habitat_types(id) ON DELETE SET NULL;


--
-- Name: habitats habitats_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habitats
    ADD CONSTRAINT habitats_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: habitats habitats_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habitats
    ADD CONSTRAINT habitats_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: insecticide_batches insecticide_batches_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insecticide_batches
    ADD CONSTRAINT insecticide_batches_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: insecticide_batches insecticide_batches_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insecticide_batches
    ADD CONSTRAINT insecticide_batches_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: insecticide_batches insecticide_batches_insecticide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insecticide_batches
    ADD CONSTRAINT insecticide_batches_insecticide_id_fkey FOREIGN KEY (insecticide_id) REFERENCES public.insecticides(id) ON DELETE RESTRICT;


--
-- Name: insecticide_batches insecticide_batches_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insecticide_batches
    ADD CONSTRAINT insecticide_batches_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: insecticide_batches insecticide_batches_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insecticide_batches
    ADD CONSTRAINT insecticide_batches_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: insecticides insecticides_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insecticides
    ADD CONSTRAINT insecticides_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: insecticides insecticides_default_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insecticides
    ADD CONSTRAINT insecticides_default_unit_id_fkey FOREIGN KEY (default_unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- Name: insecticides insecticides_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insecticides
    ADD CONSTRAINT insecticides_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: insecticides insecticides_inventory_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insecticides
    ADD CONSTRAINT insecticides_inventory_unit_id_fkey FOREIGN KEY (inventory_unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- Name: insecticides insecticides_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insecticides
    ADD CONSTRAINT insecticides_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: insecticides insecticides_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insecticides
    ADD CONSTRAINT insecticides_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: inspections inspections_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_address_id_fkey FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON DELETE RESTRICT;


--
-- Name: inspections inspections_assignment_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_assignment_item_id_fkey FOREIGN KEY (assignment_item_id) REFERENCES public.assignment_items(id) ON DELETE SET NULL;


--
-- Name: inspections inspections_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: inspections inspections_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: inspections inspections_habitat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_habitat_id_fkey FOREIGN KEY (habitat_id) REFERENCES public.habitats(id) ON DELETE SET NULL;


--
-- Name: inspections inspections_habitat_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_habitat_type_id_fkey FOREIGN KEY (habitat_type_id) REFERENCES public.habitat_types(id) ON DELETE SET NULL;


--
-- Name: inspections inspections_inspected_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_inspected_by_profile_id_fkey FOREIGN KEY (inspected_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: inspections inspections_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: inspections inspections_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspections
    ADD CONSTRAINT inspections_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: memberships memberships_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: memberships memberships_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: memberships memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: mission_items mission_items_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_items
    ADD CONSTRAINT mission_items_address_id_fkey FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON DELETE RESTRICT;


--
-- Name: mission_items mission_items_completed_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_items
    ADD CONSTRAINT mission_items_completed_by_profile_id_fkey FOREIGN KEY (completed_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: mission_items mission_items_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_items
    ADD CONSTRAINT mission_items_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: mission_items mission_items_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_items
    ADD CONSTRAINT mission_items_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: mission_items mission_items_mission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_items
    ADD CONSTRAINT mission_items_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.missions(id) ON DELETE CASCADE;


--
-- Name: mission_items mission_items_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_items
    ADD CONSTRAINT mission_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: mission_items mission_items_requested_control_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_items
    ADD CONSTRAINT mission_items_requested_control_action_id_fkey FOREIGN KEY (requested_control_action_id) REFERENCES public.requested_control_actions(id) ON DELETE SET NULL;


--
-- Name: mission_items mission_items_skipped_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_items
    ADD CONSTRAINT mission_items_skipped_by_profile_id_fkey FOREIGN KEY (skipped_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: mission_items mission_items_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_items
    ADD CONSTRAINT mission_items_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: mission_notifications mission_notifications_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_notifications
    ADD CONSTRAINT mission_notifications_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE RESTRICT;


--
-- Name: mission_notifications mission_notifications_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_notifications
    ADD CONSTRAINT mission_notifications_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: mission_notifications mission_notifications_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_notifications
    ADD CONSTRAINT mission_notifications_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: mission_notifications mission_notifications_mission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_notifications
    ADD CONSTRAINT mission_notifications_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.missions(id) ON DELETE CASCADE;


--
-- Name: mission_notifications mission_notifications_notification_registration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_notifications
    ADD CONSTRAINT mission_notifications_notification_registration_id_fkey FOREIGN KEY (notification_registration_id) REFERENCES public.notification_registrations(id) ON DELETE RESTRICT;


--
-- Name: mission_notifications mission_notifications_notification_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_notifications
    ADD CONSTRAINT mission_notifications_notification_type_id_fkey FOREIGN KEY (notification_type_id) REFERENCES public.notification_types(id) ON DELETE RESTRICT;


--
-- Name: mission_notifications mission_notifications_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_notifications
    ADD CONSTRAINT mission_notifications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: mission_notifications mission_notifications_status_changed_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_notifications
    ADD CONSTRAINT mission_notifications_status_changed_by_profile_id_fkey FOREIGN KEY (status_changed_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: mission_notifications mission_notifications_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_notifications
    ADD CONSTRAINT mission_notifications_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: missions missions_assigned_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.missions
    ADD CONSTRAINT missions_assigned_by_profile_id_fkey FOREIGN KEY (assigned_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: missions missions_assigned_to_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.missions
    ADD CONSTRAINT missions_assigned_to_profile_id_fkey FOREIGN KEY (assigned_to_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: missions missions_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.missions
    ADD CONSTRAINT missions_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: missions missions_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.missions
    ADD CONSTRAINT missions_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: missions missions_notification_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.missions
    ADD CONSTRAINT missions_notification_type_id_fkey FOREIGN KEY (notification_type_id) REFERENCES public.notification_types(id) ON DELETE SET NULL;


--
-- Name: missions missions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.missions
    ADD CONSTRAINT missions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: missions missions_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.missions
    ADD CONSTRAINT missions_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notification_registration_types notification_registration_typ_notification_registration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_registration_types
    ADD CONSTRAINT notification_registration_typ_notification_registration_id_fkey FOREIGN KEY (notification_registration_id) REFERENCES public.notification_registrations(id) ON DELETE CASCADE;


--
-- Name: notification_registration_types notification_registration_types_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_registration_types
    ADD CONSTRAINT notification_registration_types_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notification_registration_types notification_registration_types_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_registration_types
    ADD CONSTRAINT notification_registration_types_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notification_registration_types notification_registration_types_notification_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_registration_types
    ADD CONSTRAINT notification_registration_types_notification_type_id_fkey FOREIGN KEY (notification_type_id) REFERENCES public.notification_types(id) ON DELETE CASCADE;


--
-- Name: notification_registration_types notification_registration_types_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_registration_types
    ADD CONSTRAINT notification_registration_types_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: notification_registration_types notification_registration_types_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_registration_types
    ADD CONSTRAINT notification_registration_types_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notification_registrations notification_registrations_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_registrations
    ADD CONSTRAINT notification_registrations_address_id_fkey FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON DELETE RESTRICT;


--
-- Name: notification_registrations notification_registrations_buffer_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_registrations
    ADD CONSTRAINT notification_registrations_buffer_unit_id_fkey FOREIGN KEY (buffer_unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- Name: notification_registrations notification_registrations_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_registrations
    ADD CONSTRAINT notification_registrations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE RESTRICT;


--
-- Name: notification_registrations notification_registrations_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_registrations
    ADD CONSTRAINT notification_registrations_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notification_registrations notification_registrations_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_registrations
    ADD CONSTRAINT notification_registrations_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notification_registrations notification_registrations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_registrations
    ADD CONSTRAINT notification_registrations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: notification_registrations notification_registrations_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_registrations
    ADD CONSTRAINT notification_registrations_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notification_types notification_types_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_types
    ADD CONSTRAINT notification_types_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notification_types notification_types_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_types
    ADD CONSTRAINT notification_types_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notification_types notification_types_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_types
    ADD CONSTRAINT notification_types_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: notification_types notification_types_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_types
    ADD CONSTRAINT notification_types_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: organization_species organization_species_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_species
    ADD CONSTRAINT organization_species_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: organization_species organization_species_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_species
    ADD CONSTRAINT organization_species_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: organization_species organization_species_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_species
    ADD CONSTRAINT organization_species_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: organization_species organization_species_species_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_species
    ADD CONSTRAINT organization_species_species_id_fkey FOREIGN KEY (species_id) REFERENCES public.species(id) ON DELETE RESTRICT;


--
-- Name: organization_species organization_species_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_species
    ADD CONSTRAINT organization_species_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: organizations organizations_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: organizations organizations_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: outreach_actions outreach_actions_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_actions
    ADD CONSTRAINT outreach_actions_address_id_fkey FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON DELETE RESTRICT;


--
-- Name: outreach_actions outreach_actions_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_actions
    ADD CONSTRAINT outreach_actions_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: outreach_actions outreach_actions_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_actions
    ADD CONSTRAINT outreach_actions_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: outreach_actions outreach_actions_inspection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_actions
    ADD CONSTRAINT outreach_actions_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.inspections(id) ON DELETE SET NULL;


--
-- Name: outreach_actions outreach_actions_mission_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_actions
    ADD CONSTRAINT outreach_actions_mission_item_id_fkey FOREIGN KEY (mission_item_id) REFERENCES public.mission_items(id) ON DELETE SET NULL;


--
-- Name: outreach_actions outreach_actions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_actions
    ADD CONSTRAINT outreach_actions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: outreach_actions outreach_actions_outreach_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_actions
    ADD CONSTRAINT outreach_actions_outreach_method_id_fkey FOREIGN KEY (outreach_method_id) REFERENCES public.outreach_methods(id) ON DELETE RESTRICT;


--
-- Name: outreach_actions outreach_actions_requested_control_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_actions
    ADD CONSTRAINT outreach_actions_requested_control_action_id_fkey FOREIGN KEY (requested_control_action_id) REFERENCES public.requested_control_actions(id) ON DELETE SET NULL;


--
-- Name: outreach_actions outreach_actions_technician_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_actions
    ADD CONSTRAINT outreach_actions_technician_profile_id_fkey FOREIGN KEY (technician_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: outreach_actions outreach_actions_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_actions
    ADD CONSTRAINT outreach_actions_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: outreach_methods outreach_methods_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_methods
    ADD CONSTRAINT outreach_methods_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: outreach_methods outreach_methods_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_methods
    ADD CONSTRAINT outreach_methods_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: outreach_methods outreach_methods_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_methods
    ADD CONSTRAINT outreach_methods_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: outreach_methods outreach_methods_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_methods
    ADD CONSTRAINT outreach_methods_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: region_folders region_folders_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.region_folders
    ADD CONSTRAINT region_folders_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: region_folders region_folders_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.region_folders
    ADD CONSTRAINT region_folders_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: region_folders region_folders_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.region_folders
    ADD CONSTRAINT region_folders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: region_folders region_folders_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.region_folders
    ADD CONSTRAINT region_folders_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: regions regions_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: regions regions_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: regions regions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: regions regions_region_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_region_folder_id_fkey FOREIGN KEY (region_folder_id) REFERENCES public.region_folders(id) ON DELETE SET NULL;


--
-- Name: regions regions_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: requested_control_actions requested_control_actions_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requested_control_actions
    ADD CONSTRAINT requested_control_actions_address_id_fkey FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON DELETE RESTRICT;


--
-- Name: requested_control_actions requested_control_actions_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requested_control_actions
    ADD CONSTRAINT requested_control_actions_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON DELETE SET NULL;


--
-- Name: requested_control_actions requested_control_actions_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requested_control_actions
    ADD CONSTRAINT requested_control_actions_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: requested_control_actions requested_control_actions_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requested_control_actions
    ADD CONSTRAINT requested_control_actions_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: requested_control_actions requested_control_actions_habitat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requested_control_actions
    ADD CONSTRAINT requested_control_actions_habitat_id_fkey FOREIGN KEY (habitat_id) REFERENCES public.habitats(id) ON DELETE SET NULL;


--
-- Name: requested_control_actions requested_control_actions_inspection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requested_control_actions
    ADD CONSTRAINT requested_control_actions_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.inspections(id) ON DELETE SET NULL;


--
-- Name: requested_control_actions requested_control_actions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requested_control_actions
    ADD CONSTRAINT requested_control_actions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: requested_control_actions requested_control_actions_requested_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requested_control_actions
    ADD CONSTRAINT requested_control_actions_requested_by_profile_id_fkey FOREIGN KEY (requested_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: requested_control_actions requested_control_actions_resolved_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requested_control_actions
    ADD CONSTRAINT requested_control_actions_resolved_by_profile_id_fkey FOREIGN KEY (resolved_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: requested_control_actions requested_control_actions_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requested_control_actions
    ADD CONSTRAINT requested_control_actions_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: route_items route_items_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_items
    ADD CONSTRAINT route_items_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: route_items route_items_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_items
    ADD CONSTRAINT route_items_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: route_items route_items_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_items
    ADD CONSTRAINT route_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: route_items route_items_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_items
    ADD CONSTRAINT route_items_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.routes(id) ON DELETE CASCADE;


--
-- Name: route_items route_items_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_items
    ADD CONSTRAINT route_items_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: routes routes_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: routes routes_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: routes routes_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: routes routes_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sample_species sample_species_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_species
    ADD CONSTRAINT sample_species_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sample_species sample_species_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_species
    ADD CONSTRAINT sample_species_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sample_species sample_species_identified_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_species
    ADD CONSTRAINT sample_species_identified_by_profile_id_fkey FOREIGN KEY (identified_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: sample_species sample_species_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_species
    ADD CONSTRAINT sample_species_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: sample_species sample_species_sample_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_species
    ADD CONSTRAINT sample_species_sample_id_fkey FOREIGN KEY (sample_id) REFERENCES public.samples(id) ON DELETE RESTRICT;


--
-- Name: sample_species sample_species_species_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_species
    ADD CONSTRAINT sample_species_species_id_fkey FOREIGN KEY (species_id) REFERENCES public.species(id) ON DELETE RESTRICT;


--
-- Name: sample_species sample_species_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sample_species
    ADD CONSTRAINT sample_species_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: samples samples_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.samples
    ADD CONSTRAINT samples_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: samples samples_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.samples
    ADD CONSTRAINT samples_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: samples samples_inspection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.samples
    ADD CONSTRAINT samples_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.inspections(id) ON DELETE RESTRICT;


--
-- Name: samples samples_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.samples
    ADD CONSTRAINT samples_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: samples samples_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.samples
    ADD CONSTRAINT samples_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: service_requests service_requests_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_address_id_fkey FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON DELETE RESTRICT;


--
-- Name: service_requests service_requests_closed_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_closed_by_profile_id_fkey FOREIGN KEY (closed_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: service_requests service_requests_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE RESTRICT;


--
-- Name: service_requests service_requests_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: service_requests service_requests_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: service_requests service_requests_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: service_requests service_requests_received_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_received_by_profile_id_fkey FOREIGN KEY (received_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: service_requests service_requests_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: source_reduction_methods source_reduction_methods_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_reduction_methods
    ADD CONSTRAINT source_reduction_methods_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: source_reduction_methods source_reduction_methods_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_reduction_methods
    ADD CONSTRAINT source_reduction_methods_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: source_reduction_methods source_reduction_methods_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_reduction_methods
    ADD CONSTRAINT source_reduction_methods_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: source_reduction_methods source_reduction_methods_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_reduction_methods
    ADD CONSTRAINT source_reduction_methods_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: source_reductions source_reductions_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_reductions
    ADD CONSTRAINT source_reductions_address_id_fkey FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON DELETE RESTRICT;


--
-- Name: source_reductions source_reductions_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_reductions
    ADD CONSTRAINT source_reductions_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: source_reductions source_reductions_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_reductions
    ADD CONSTRAINT source_reductions_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: source_reductions source_reductions_habitat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_reductions
    ADD CONSTRAINT source_reductions_habitat_id_fkey FOREIGN KEY (habitat_id) REFERENCES public.habitats(id) ON DELETE SET NULL;


--
-- Name: source_reductions source_reductions_inspection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_reductions
    ADD CONSTRAINT source_reductions_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.inspections(id) ON DELETE SET NULL;


--
-- Name: source_reductions source_reductions_mission_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_reductions
    ADD CONSTRAINT source_reductions_mission_item_id_fkey FOREIGN KEY (mission_item_id) REFERENCES public.mission_items(id) ON DELETE SET NULL;


--
-- Name: source_reductions source_reductions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_reductions
    ADD CONSTRAINT source_reductions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: source_reductions source_reductions_requested_control_action_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_reductions
    ADD CONSTRAINT source_reductions_requested_control_action_id_fkey FOREIGN KEY (requested_control_action_id) REFERENCES public.requested_control_actions(id) ON DELETE SET NULL;


--
-- Name: source_reductions source_reductions_source_reduction_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_reductions
    ADD CONSTRAINT source_reductions_source_reduction_method_id_fkey FOREIGN KEY (source_reduction_method_id) REFERENCES public.source_reduction_methods(id) ON DELETE RESTRICT;


--
-- Name: source_reductions source_reductions_sources_eliminated_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_reductions
    ADD CONSTRAINT source_reductions_sources_eliminated_unit_id_fkey FOREIGN KEY (sources_eliminated_unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- Name: source_reductions source_reductions_technician_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_reductions
    ADD CONSTRAINT source_reductions_technician_profile_id_fkey FOREIGN KEY (technician_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: source_reductions source_reductions_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_reductions
    ADD CONSTRAINT source_reductions_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: species species_genus_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.species
    ADD CONSTRAINT species_genus_id_fkey FOREIGN KEY (genus_id) REFERENCES public.genera(id) ON DELETE RESTRICT;


--
-- Name: tag_items tag_items_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_items
    ADD CONSTRAINT tag_items_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: tag_items tag_items_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_items
    ADD CONSTRAINT tag_items_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: tag_items tag_items_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_items
    ADD CONSTRAINT tag_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: tag_items tag_items_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_items
    ADD CONSTRAINT tag_items_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE RESTRICT;


--
-- Name: tag_items tag_items_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tag_items
    ADD CONSTRAINT tag_items_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: tags tags_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: tags tags_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: tags tags_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: tags tags_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: traps traps_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.traps
    ADD CONSTRAINT traps_address_id_fkey FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON DELETE RESTRICT;


--
-- Name: traps traps_collection_lure_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.traps
    ADD CONSTRAINT traps_collection_lure_id_fkey FOREIGN KEY (collection_lure_id) REFERENCES public.collection_lures(id) ON DELETE SET NULL;


--
-- Name: traps traps_collection_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.traps
    ADD CONSTRAINT traps_collection_method_id_fkey FOREIGN KEY (collection_method_id) REFERENCES public.collection_methods(id) ON DELETE RESTRICT;


--
-- Name: traps traps_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.traps
    ADD CONSTRAINT traps_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: traps traps_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.traps
    ADD CONSTRAINT traps_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: traps traps_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.traps
    ADD CONSTRAINT traps_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: traps traps_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.traps
    ADD CONSTRAINT traps_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: vehicles vehicles_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: vehicles vehicles_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: vehicles vehicles_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: vehicles vehicles_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: weather_source_subscriptions weather_source_subscriptions_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_source_subscriptions
    ADD CONSTRAINT weather_source_subscriptions_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: weather_source_subscriptions weather_source_subscriptions_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_source_subscriptions
    ADD CONSTRAINT weather_source_subscriptions_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: weather_source_subscriptions weather_source_subscriptions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_source_subscriptions
    ADD CONSTRAINT weather_source_subscriptions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: weather_source_subscriptions weather_source_subscriptions_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_source_subscriptions
    ADD CONSTRAINT weather_source_subscriptions_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: weather_source_subscriptions weather_source_subscriptions_weather_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_source_subscriptions
    ADD CONSTRAINT weather_source_subscriptions_weather_source_id_fkey FOREIGN KEY (weather_source_id) REFERENCES public.weather_sources(id) ON DELETE RESTRICT;


--
-- Name: weather_sources weather_sources_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_sources
    ADD CONSTRAINT weather_sources_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: weather_sources weather_sources_deleted_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_sources
    ADD CONSTRAINT weather_sources_deleted_by_profile_id_fkey FOREIGN KEY (deleted_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: weather_sources weather_sources_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_sources
    ADD CONSTRAINT weather_sources_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: weather_sources weather_sources_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_sources
    ADD CONSTRAINT weather_sources_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: weather_summaries weather_summaries_created_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_summaries
    ADD CONSTRAINT weather_summaries_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: weather_summaries weather_summaries_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_summaries
    ADD CONSTRAINT weather_summaries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: weather_summaries weather_summaries_updated_by_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_summaries
    ADD CONSTRAINT weather_summaries_updated_by_profile_id_fkey FOREIGN KEY (updated_by_profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: weather_summaries weather_summaries_weather_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weather_summaries
    ADD CONSTRAINT weather_summaries_weather_source_id_fkey FOREIGN KEY (weather_source_id) REFERENCES public.weather_sources(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('202605060001'),
    ('202605060002'),
    ('202605060003'),
    ('202605060004'),
    ('202605060005'),
    ('202605060006'),
    ('202605060007'),
    ('202605060008'),
    ('202605060009'),
    ('202605080001'),
    ('202605100001'),
    ('202605110001'),
    ('202605120001'),
    ('202605120002'),
    ('202605120003'),
    ('202605130001'),
    ('202605140001'),
    ('202605220001'),
    ('202605260001'),
    ('202605260002'),
    ('202605270001'),
    ('202605270002'),
    ('202605270003'),
    ('202607070001'),
    ('202608030001'),
    ('202608050001'),
    ('202608110001'),
    ('202608190001'),
    ('202608260001'),
    ('202608300001'),
    ('202609030001');
