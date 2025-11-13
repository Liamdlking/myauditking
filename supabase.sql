-- Clean Supabase schema for Audit King Pro (auth + optional tables)

-- Profiles table for roles, site access, etc
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  name text,
  role text not null default 'inspector',
  site_access text[],
  is_banned boolean not null default false,
  created_at timestamptz default now()
);

-- Simple sites table
create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text
);

-- Trigger: create profile row after each auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role, site_access, is_banned)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    'inspector',
    '{}',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Example RLS (adjust as needed)
alter table public.profiles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'profiles_select_own') then
    create policy "profiles_select_own"
      on public.profiles
      for select
      using (auth.uid() = id);
  end if;
end;
$$;
