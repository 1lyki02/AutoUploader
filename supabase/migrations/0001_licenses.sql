create extension if not exists pgcrypto;

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  key_prefix text not null,
  customer_name text not null,
  customer_contact text,
  plan text not null default 'pro',
  duration_days integer not null check (duration_days > 0),
  status text not null default 'unactivated'
    check (status in ('unactivated', 'active', 'expired', 'revoked')),
  machine_id_hash text,
  activated_at timestamptz,
  expires_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.license_events (
  id bigint generated always as identity primary key,
  license_id uuid not null references public.licenses(id) on delete cascade,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists licenses_status_expires_idx
  on public.licenses(status, expires_at);
create index if not exists license_events_license_created_idx
  on public.license_events(license_id, created_at desc);

alter table public.licenses enable row level security;
alter table public.license_events enable row level security;

create or replace function public.activate_license(
  p_key_hash text,
  p_machine_id_hash text
)
returns table (
  license_id uuid,
  result_status text,
  plan text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  row_license public.licenses%rowtype;
begin
  select * into row_license
  from public.licenses
  where key_hash = p_key_hash
  for update;

  if not found then
    return query select null::uuid, 'invalid'::text, null::text, null::timestamptz;
    return;
  end if;

  if row_license.status = 'revoked' then
    return query select row_license.id, 'revoked'::text, row_license.plan, row_license.expires_at;
    return;
  end if;

  if row_license.machine_id_hash is null then
    update public.licenses
    set machine_id_hash = p_machine_id_hash,
        activated_at = now(),
        expires_at = now() + (duration_days * interval '1 day'),
        status = 'active',
        updated_at = now()
    where id = row_license.id
    returning * into row_license;

    insert into public.license_events (license_id, event_type)
    values (row_license.id, 'activated');
  elsif row_license.machine_id_hash <> p_machine_id_hash then
    return query select row_license.id, 'already_activated'::text, row_license.plan, row_license.expires_at;
    return;
  end if;

  if row_license.expires_at is null or row_license.expires_at <= now() then
    update public.licenses
    set status = 'expired', updated_at = now()
    where id = row_license.id
    returning * into row_license;
    return query select row_license.id, 'expired'::text, row_license.plan, row_license.expires_at;
    return;
  end if;

  if row_license.status <> 'active' then
    update public.licenses
    set status = 'active', updated_at = now()
    where id = row_license.id
    returning * into row_license;
  end if;

  return query select row_license.id, 'active'::text, row_license.plan, row_license.expires_at;
end;
$$;

create or replace function public.admin_update_license(
  p_license_id uuid,
  p_action text,
  p_days integer default null
)
returns public.licenses
language plpgsql
security definer
set search_path = public
as $$
declare
  row_license public.licenses%rowtype;
begin
  select * into row_license
  from public.licenses
  where id = p_license_id
  for update;

  if not found then
    raise exception 'license_not_found';
  end if;

  if p_action = 'extend' then
    if p_days is null or p_days < 1 then
      raise exception 'invalid_extension';
    end if;
    if row_license.machine_id_hash is null then
      update public.licenses
      set duration_days = duration_days + p_days, updated_at = now()
      where id = p_license_id;
    else
      update public.licenses
      set expires_at = greatest(coalesce(expires_at, now()), now()) + (p_days * interval '1 day'),
          status = case when status = 'revoked' then 'revoked' else 'active' end,
          updated_at = now()
      where id = p_license_id;
    end if;
  elsif p_action = 'revoke' then
    update public.licenses set status = 'revoked', updated_at = now()
    where id = p_license_id;
  elsif p_action = 'restore' then
    update public.licenses
    set status = case
      when machine_id_hash is null then 'unactivated'
      when expires_at > now() then 'active'
      else 'expired'
    end,
    updated_at = now()
    where id = p_license_id;
  elsif p_action = 'reset-device' then
    update public.licenses
    set machine_id_hash = null,
        activated_at = null,
        expires_at = null,
        status = case when status = 'revoked' then 'revoked' else 'unactivated' end,
        updated_at = now()
    where id = p_license_id;
  else
    raise exception 'invalid_action';
  end if;

  insert into public.license_events (license_id, event_type, details)
  values (
    p_license_id,
    p_action,
    case when p_days is null then '{}'::jsonb else jsonb_build_object('days', p_days) end
  );

  select * into row_license from public.licenses where id = p_license_id;
  return row_license;
end;
$$;

revoke all on function public.activate_license(text, text) from public;
revoke all on function public.admin_update_license(uuid, text, integer) from public;
grant execute on function public.activate_license(text, text) to service_role;
grant execute on function public.admin_update_license(uuid, text, integer) to service_role;
