create table if not exists "Todo_Note" (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null default '',
  folder text,
  tags text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table "Todo_Note" disable row level security;
