-- Run this once in your Supabase SQL editor.
-- Adds priority, due date, position (for drag-reorder) and a placeholder
-- recurrence_rule column (unused for now, reserved for the recurring-tasks phase).

alter table "Todo_Task" add column if not exists priority integer not null default 0;
alter table "Todo_Task" add column if not exists due_date date;
alter table "Todo_Task" add column if not exists recurrence_rule text;
alter table "Todo_Task" add column if not exists position integer;

-- Backfill position for existing tasks, ordered by creation time within each project
with ranked as (
  select id, row_number() over (partition by project_id order by created_at) - 1 as rn
  from "Todo_Task"
)
update "Todo_Task" t
set position = ranked.rn
from ranked
where t.id = ranked.id;
