-- Fines app: Supabase schema
-- Run this whole file once in the Supabase SQL Editor.
-- Then set your Fine Master PIN (see README).

create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------
-- Tables
-- ----------------------------------------

create table if not exists public.fines (
  id          bigint generated always as identity primary key,
  proposer    text not null check (length(proposer) between 1 and 60),
  fined       text not null check (length(fined) between 1 and 60),
  description text not null check (length(description) between 1 and 1000),
  penalty     text not null default '1 shooter' check (length(penalty) between 1 and 60),
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.archived_fines (
  id          bigint primary key,
  proposer    text not null,
  fined       text not null,
  description text not null,
  penalty     text not null,
  done        boolean not null,
  created_at  timestamptz not null,
  archived_at timestamptz not null default now()
);

create table if not exists public.settings (
  id       int primary key default 1 check (id = 1),
  pin_hash text not null
);

-- ----------------------------------------
-- Row Level Security
-- Anon users may only INSERT into fines.
-- ----------------------------------------

alter table public.fines          enable row level security;
alter table public.archived_fines enable row level security;
alter table public.settings       enable row level security;

revoke all on public.fines, public.archived_fines, public.settings from anon, authenticated;
grant insert on public.fines to anon, authenticated;

drop policy if exists "anyone can submit a fine" on public.fines;
create policy "anyone can submit a fine" on public.fines
  for insert to anon, authenticated
  with check (true);

-- ----------------------------------------
-- Names: trimmed, single-spaced, lower-case.
-- Shown in Title Case via initcap().
-- ----------------------------------------

create or replace function public.normalize_name(p text)
returns text language sql immutable
set search_path = ''
as $$
  select lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'));
$$;

-- Tidy each new fine before it is saved.
create or replace function public.fines_before_insert()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.proposer    := normalize_name(new.proposer);
  new.fined       := normalize_name(new.fined);
  new.description := btrim(new.description);
  new.penalty     := coalesce(nullif(btrim(new.penalty), ''), '1 shooter');
  new.done        := false;
  new.created_at  := now();
  return new;
end;
$$;

drop trigger if exists fines_before_insert on public.fines;
create trigger fines_before_insert
  before insert on public.fines
  for each row execute function public.fines_before_insert();

-- ----------------------------------------
-- Public functions (no PIN)
-- ----------------------------------------

-- Leaderboard: names + counts only.
create or replace function public.get_leaderboard()
returns table (name text, fine_count bigint)
language sql stable security definer
set search_path = public
as $$
  select initcap(fined), count(*)
  from fines
  group by fined
  order by count(*) desc, fined;
$$;

-- Name suggestions: distinct names only.
create or replace function public.get_names()
returns table (name text)
language sql stable security definer
set search_path = public
as $$
  select distinct initcap(n) from (
    select proposer as n from fines
    union select fined from fines
    union select proposer from archived_fines
    union select fined from archived_fines
  ) s
  order by 1;
$$;

-- ----------------------------------------
-- Fine Master functions (PIN required)
-- ----------------------------------------

-- Raises an error unless the PIN is correct.
create or replace function public._require_pin(p_pin text)
returns void
language plpgsql stable security definer
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1 from settings
    where id = 1 and pin_hash = crypt(coalesce(p_pin, ''), pin_hash)
  ) then
    raise exception 'Wrong PIN' using errcode = '28P01';
  end if;
end;
$$;

-- Used by the login screen.
create or replace function public.fm_check_pin(p_pin text)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
begin
  perform _require_pin(p_pin);
  return true;
end;
$$;

create or replace function public.fm_get_fines(p_pin text)
returns table (
  id bigint, proposer text, fined text, description text,
  penalty text, done boolean, created_at timestamptz
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  perform _require_pin(p_pin);
  return query
    select f.id, initcap(f.proposer), initcap(f.fined), f.description,
           f.penalty, f.done, f.created_at
    from fines f
    order by f.fined, f.created_at;
end;
$$;

create or replace function public.fm_set_done(p_pin text, p_id bigint, p_done boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  perform _require_pin(p_pin);
  update fines set done = p_done where id = p_id;
end;
$$;

-- Merge one name into another, e.g. Jon -> John.
create or replace function public.fm_merge_names(p_pin text, p_from text, p_to text)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_from text := normalize_name(p_from);
  v_to   text := normalize_name(p_to);
  v_count int := 0;
  v_n int;
begin
  perform _require_pin(p_pin);
  if v_from = '' or v_to = '' or v_from = v_to then
    raise exception 'Enter two different names';
  end if;

  update fines set fined = v_to where fined = v_from;
  get diagnostics v_n = row_count; v_count := v_count + v_n;
  update fines set proposer = v_to where proposer = v_from;
  get diagnostics v_n = row_count; v_count := v_count + v_n;
  update archived_fines set fined = v_to where fined = v_from;
  update archived_fines set proposer = v_to where proposer = v_from;

  return v_count;
end;
$$;

-- Archive current fines, start a new session.
create or replace function public.fm_close_session(p_pin text)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_count int;
begin
  perform _require_pin(p_pin);
  -- Supabase blocks DELETE without WHERE, hence "where true".
  with moved as (
    delete from fines where true
    returning id, proposer, fined, description,
              penalty, done, created_at
  )
  insert into archived_fines
    (id, proposer, fined, description,
     penalty, done, created_at)
  select * from moved;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ----------------------------------------
-- Function permissions
-- ----------------------------------------

revoke all on function public._require_pin(text) from public, anon, authenticated;

grant execute on function
  public.get_leaderboard(),
  public.get_names(),
  public.fm_check_pin(text),
  public.fm_get_fines(text),
  public.fm_set_done(text, bigint, boolean),
  public.fm_merge_names(text, text, text),
  public.fm_close_session(text)
to anon, authenticated;

-- ----------------------------------------
-- Past sessions (Fine Master only)
-- ----------------------------------------

create or replace function public.fm_get_archived(p_pin text)
returns table (
  id bigint, proposer text, fined text,
  description text, penalty text,
  created_at timestamptz, archived_at timestamptz
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  perform _require_pin(p_pin);
  return query
    select a.id, initcap(a.proposer),
           initcap(a.fined), a.description,
           a.penalty, a.created_at, a.archived_at
    from archived_fines a
    order by a.archived_at desc, a.fined,
             a.created_at;
end;
$$;

grant execute on function public.fm_get_archived(text)
to anon, authenticated;
