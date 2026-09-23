-- Run this once in your Supabase SQL editor.

create table if not exists "Todo_RecurringRule" (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references "Todo_Project"(id) on delete cascade,
  title text not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  days_of_week integer[],   -- 0=Sunday .. 6=Saturday, used when frequency = 'weekly'
  day_of_month integer,     -- 1-31, used when frequency = 'monthly'
  start_date date not null,
  active boolean not null default true,
  last_generated_date date,
  created_at timestamptz not null default now()
);

alter table "Todo_RecurringRule" disable row level security;

alter table "Todo_Task" add column if not exists recurrence_rule_id uuid references "Todo_RecurringRule"(id) on delete set null;
