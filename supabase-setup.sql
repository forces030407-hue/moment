-- ============================================================
-- MOMENTA – Full Supabase Schema
-- Run this in your Supabase SQL Editor to set up all tables
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── ORDERS ────────────────────────────────────────────────────────────────────
create table if not exists orders (
  id              text primary key default (encode(gen_random_bytes(6),'hex')),
  token           text unique not null,
  customer_name   text not null,
  customer_email  text default '',
  customer_phone  text default '',
  occasion        text default 'General',
  date            text default '',
  price           numeric default 0,
  advance_amount  numeric default 0,
  remaining_amount numeric default 0,
  advance_paid    boolean default false,
  remaining_paid  boolean default false,
  status          text default 'Pending',
  notes           text default '',
  final_project_link text default '',
  media_uploads   jsonb default '[]',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── SAMPLES ───────────────────────────────────────────────────────────────────
create table if not exists samples (
  id           text primary key default (encode(gen_random_bytes(6),'hex')),
  title        text default 'Sample Work',
  description  text default '',
  category     text default 'General',
  filename     text not null,
  url          text not null,
  is_video     boolean default false,
  created_at   timestamptz default now()
);

-- ── REVIEWS ───────────────────────────────────────────────────────────────────
create table if not exists reviews (
  id         text primary key default (encode(gen_random_bytes(6),'hex')),
  name       text not null,
  text       text not null,
  rating     integer default 5 check (rating between 1 and 5),
  occasion   text default '',
  avatar     text default '',
  created_at timestamptz default now()
);

-- ── Seed reviews ─────────────────────────────────────────────────────────────
insert into reviews (id, name, text, rating, occasion, avatar) values
  ('seed-r1', 'Priya Sharma', 'I was completely speechless when I opened my surprise website. Every photo, every message — it felt like reliving the most beautiful moments of my life. Momenta truly made our anniversary unforgettable! ♥', 5, 'Anniversary', 'PS'),
  ('seed-r2', 'Rahul Verma', 'Got this made for my girlfriend''s birthday. She literally cried happy tears! The 3D animations and the music choice were perfect. Delivered in under 24 hours. 10/10 recommend Momenta!', 5, 'Birthday', 'RV'),
  ('seed-r3', 'Ananya Kapoor', 'Used Momenta for my parents'' 25th anniversary surprise. The whole family was in tears — beautiful tears! The design was so elegant and personal. Worth every rupee and more. 🎁', 5, 'Silver Jubilee', 'AK')
on conflict (id) do nothing;

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table orders enable row level security;
alter table samples enable row level security;
alter table reviews enable row level security;

-- Public read for samples and reviews
create policy "Public read samples" on samples for select using (true);
create policy "Public read reviews" on reviews for select using (true);

-- Service role has full access (for server-side operations)
-- Your SUPABASE_SERVICE_KEY bypasses RLS automatically

-- ── Updated_at trigger ────────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger orders_updated_at before update on orders
  for each row execute function update_updated_at();
