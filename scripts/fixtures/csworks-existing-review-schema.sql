-- Local test fixture from user-supplied column/trigger metadata (2026-10-26).

-- No customer rows. Not a migration; does not claim to reproduce unexported constraints/RLS.

create table public.projects (
  "id" uuid not null default gen_random_uuid() primary key,
  "project_code" text not null,
  "user_id" uuid not null,
  "estimate_id" uuid,
  "title" text not null,
  "description" text,
  "status" text not null default 'quote_requested'::text,
  "quoted_amount" int4,
  "quoted_hours" numeric,
  "desired_deadline" date,
  "confirmed_deadline" date,
  "ordered_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  "archived_at" timestamptz,
  "quote_presented_at" timestamptz
);

create table public.project_files (
  "id" uuid not null default gen_random_uuid() primary key,
  "project_id" uuid not null,
  "uploaded_by" uuid not null,
  "file_name" text not null,
  "storage_path" text not null,
  "mime_type" text,
  "file_size" int8,
  "file_type" text not null default 'reference'::text,
  "created_at" timestamptz not null default now()
);

create table public.project_messages (
  "id" uuid not null default gen_random_uuid() primary key,
  "project_id" uuid not null,
  "user_id" uuid not null,
  "message" text not null,
  "message_type" text not null default 'message'::text,
  "created_at" timestamptz not null default now(),
  "read_by_admin_at" timestamptz,
  "sender_type" text not null default 'system'::text,
  "read_by_customer_at" timestamptz
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
