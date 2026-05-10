-- ═══════════════════════════════════════════════════════════════
-- LUMEN — Supabase PostgreSQL Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension (usually already enabled)
create extension if not exists "pgcrypto";

-- ── Super Admins ──────────────────────────────────────────────
create table if not exists super_admins (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null unique,
  password_hash text not null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── Departments ───────────────────────────────────────────────
create table if not exists departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_by  uuid references super_admins(id) on delete set null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── Admins ────────────────────────────────────────────────────
create table if not exists admins (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null unique,
  password_hash text not null,
  dept_id       uuid references departments(id) on delete set null,
  created_by    uuid references super_admins(id) on delete set null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── Users ─────────────────────────────────────────────────────
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null unique,
  password_hash text not null,
  dept_id       uuid references departments(id) on delete set null,
  created_by    uuid references admins(id) on delete set null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── Briefs ────────────────────────────────────────────────────
-- versions and attachments stored as JSONB (flexible, no N+1 queries)
create table if not exists briefs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references users(id) on delete cascade not null,
  client_name     text not null,
  raw_text_input  text,
  share_token     text unique not null,
  status          text not null default 'DRAFT'
                    check (status in ('DRAFT','SENT','NEEDS_REVISION','CONFIRMED')),
  current_version int not null default 1,
  confirmed_at    timestamptz,
  versions        jsonb not null default '[]',
  attachments     jsonb not null default '[]',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_briefs_user_id    on briefs(user_id);
create index if not exists idx_briefs_share_token on briefs(share_token);
create index if not exists idx_briefs_status      on briefs(status);

-- ── Notifications ─────────────────────────────────────────────
create table if not exists notifications (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid references users(id) on delete cascade not null,
  type      text not null check (type in ('BRIEF_CONFIRMED','BRIEF_REJECTED','BRIEF_RESENT')),
  title     text not null,
  body      text not null,
  brief_id  uuid references briefs(id) on delete set null,
  is_read   boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists idx_notifications_user_id on notifications(user_id);
create index if not exists idx_notifications_is_read  on notifications(user_id, is_read);

-- ── Auto-update updated_at ────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace trigger trg_super_admins_updated
  before update on super_admins
  for each row execute function update_updated_at();

create or replace trigger trg_departments_updated
  before update on departments
  for each row execute function update_updated_at();

create or replace trigger trg_admins_updated
  before update on admins
  for each row execute function update_updated_at();

create or replace trigger trg_users_updated
  before update on users
  for each row execute function update_updated_at();

create or replace trigger trg_briefs_updated
  before update on briefs
  for each row execute function update_updated_at();

-- ── Disable Row Level Security (app uses service_role key) ────
-- RLS is disabled because the backend uses service_role key which bypasses RLS.
-- This is safe as long as the service_role key is NEVER exposed to the frontend.
alter table super_admins  disable row level security;
alter table departments   disable row level security;
alter table admins        disable row level security;
alter table users         disable row level security;
alter table briefs        disable row level security;
alter table notifications disable row level security;
