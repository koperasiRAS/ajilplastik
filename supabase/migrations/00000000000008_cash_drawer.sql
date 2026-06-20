-- Create table for cash drawer logs
create table cash_drawer_logs (
    id uuid primary key default uuid_generate_v4(),
    branch_id uuid references branches(id),
    opened_by uuid references profiles(id),
    reason text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS
alter table cash_drawer_logs enable row level security;

create policy "Users can view logs for their branch"
    on cash_drawer_logs for select
    to authenticated
    using (branch_id = (select branch_id from profiles where id = auth.uid()));

create policy "Users can insert logs for their branch"
    on cash_drawer_logs for insert
    to authenticated
    with check (branch_id = (select branch_id from profiles where id = auth.uid()));
