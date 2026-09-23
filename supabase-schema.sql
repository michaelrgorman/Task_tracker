create table if not exists "Todo_Project" (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists "Todo_Task" (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references "Todo_Project"(id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  priority integer not null default 0,
  due_date date,
  recurrence_rule text,
  position integer,
  created_at timestamptz not null default now()
);

create table if not exists "Todo_Subtask" (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references "Todo_Task"(id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table "Todo_Project" disable row level security;
alter table "Todo_Task" disable row level security;
alter table "Todo_Subtask" disable row level security;
