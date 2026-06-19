-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. branches
create table public.branches (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. profiles (extends auth.users)
create type public.user_role as enum ('owner', 'kasir');

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  role user_role not null default 'kasir',
  branch_id uuid references public.branches(id),
  full_name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. product_categories
create table public.product_categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. products
create table public.products (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid references public.product_categories(id) on delete set null,
  barcode text unique,
  name text not null,
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. product_units
create table public.product_units (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  conversion_to_base integer not null check (conversion_to_base > 0),
  is_base_unit boolean not null default false,
  sell_price numeric not null check (sell_price >= 0),
  buy_price numeric check (buy_price >= 0),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. product_stock
create table public.product_stock (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(branch_id, product_id)
);

-- 7. stock_movements
create type public.movement_type as enum ('restock', 'sale', 'manual_correction', 'void');

create table public.stock_movements (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  type movement_type not null,
  quantity_change integer not null,
  reference_id uuid,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 8. transactions
create type public.payment_method_type as enum ('cash', 'transfer', 'qris');
create type public.transaction_status as enum ('completed', 'void');

create table public.transactions (
  id uuid primary key default uuid_generate_v4(),
  transaction_number text not null unique,
  branch_id uuid not null references public.branches(id) on delete cascade,
  cashier_id uuid not null references public.profiles(id),
  payment_method payment_method_type not null,
  status transaction_status not null default 'completed',
  total_amount numeric not null check (total_amount >= 0),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 9. transaction_items
create table public.transaction_items (
  id uuid primary key default uuid_generate_v4(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_unit_id uuid not null references public.product_units(id),
  unit_name_snapshot text not null,
  conversion_to_base_snapshot integer not null,
  quantity integer not null check (quantity > 0),
  price_snapshot numeric not null check (price_snapshot >= 0),
  subtotal numeric not null check (subtotal >= 0),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 10. expenses
create table public.expenses (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  category text not null,
  amount numeric not null check (amount >= 0),
  description text,
  date date not null,
  attachment_url text,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 11. incomes
create table public.incomes (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  category text not null,
  amount numeric not null check (amount >= 0),
  description text,
  date date not null,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 12. suppliers
create table public.suppliers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  contact text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 13. restocks
create table public.restocks (
  id uuid primary key default uuid_generate_v4(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  product_id uuid not null references public.products(id),
  product_unit_id uuid not null references public.product_units(id),
  quantity integer not null check (quantity > 0),
  buy_price numeric not null check (buy_price >= 0),
  date date not null,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS POLICIES --
-- Enable RLS for all tables
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_units enable row level security;
alter table public.product_stock enable row level security;
alter table public.stock_movements enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.expenses enable row level security;
alter table public.incomes enable row level security;
alter table public.suppliers enable row level security;
alter table public.restocks enable row level security;

-- Create helper function to get current user's profile
create or replace function public.get_current_user_profile()
returns public.profiles
language sql security definer
as $$
  select * from public.profiles where id = auth.uid() limit 1;
$$;

-- 1. branches (Semua authenticated user bisa lihat. Owner bisa edit)
create policy "Branches viewable by all" on public.branches for select using (auth.role() = 'authenticated');
create policy "Branches manageable by owner" on public.branches for all using (
  (select role from public.get_current_user_profile()) = 'owner'
);

-- 2. profiles (Semua authenticated user bisa lihat profil. Owner bisa ubah semua. User bisa ubah dirinya sendiri - optional tapi biasanya aman)
create policy "Profiles viewable by all" on public.profiles for select using (auth.role() = 'authenticated');
create policy "Profiles manageable by owner" on public.profiles for all using (
  (select role from public.get_current_user_profile()) = 'owner'
);

-- 3, 4, 5. product_categories, products, product_units
create policy "Categories viewable by all" on public.product_categories for select using (auth.role() = 'authenticated');
create policy "Categories manageable by owner" on public.product_categories for all using ((select role from public.get_current_user_profile()) = 'owner');

create policy "Products viewable by all" on public.products for select using (auth.role() = 'authenticated');
create policy "Products manageable by owner" on public.products for all using ((select role from public.get_current_user_profile()) = 'owner');

create policy "Product units viewable by all" on public.product_units for select using (auth.role() = 'authenticated');
create policy "Product units manageable by owner" on public.product_units for all using ((select role from public.get_current_user_profile()) = 'owner');

-- 6. product_stock
create policy "Stock viewable by owner" on public.product_stock for select using ((select role from public.get_current_user_profile()) = 'owner');
create policy "Stock viewable by branch cashier" on public.product_stock for select using (
  branch_id = (select branch_id from public.get_current_user_profile())
);
create policy "Stock manageable by owner" on public.product_stock for all using ((select role from public.get_current_user_profile()) = 'owner');
create policy "Stock updatable by branch cashier" on public.product_stock for update using (
  branch_id = (select branch_id from public.get_current_user_profile())
);
create policy "Stock insertable by branch cashier" on public.product_stock for insert with check (
  branch_id = (select branch_id from public.get_current_user_profile())
);

-- 7. stock_movements
create policy "Movements viewable by owner" on public.stock_movements for select using ((select role from public.get_current_user_profile()) = 'owner');
create policy "Movements manageable by owner" on public.stock_movements for all using ((select role from public.get_current_user_profile()) = 'owner');
create policy "Movements insertable by branch cashier" on public.stock_movements for insert with check (branch_id = (select branch_id from public.get_current_user_profile()));
create policy "Movements viewable by branch cashier" on public.stock_movements for select using (branch_id = (select branch_id from public.get_current_user_profile()));

-- 8. transactions
create policy "Transactions viewable by owner" on public.transactions for select using ((select role from public.get_current_user_profile()) = 'owner');
create policy "Transactions manageable by owner" on public.transactions for all using ((select role from public.get_current_user_profile()) = 'owner');
create policy "Transactions insertable by branch cashier" on public.transactions for insert with check (branch_id = (select branch_id from public.get_current_user_profile()));
create policy "Transactions viewable by branch cashier" on public.transactions for select using (branch_id = (select branch_id from public.get_current_user_profile()));

-- 9. transaction_items
create policy "Transaction items viewable by owner" on public.transaction_items for select using ((select role from public.get_current_user_profile()) = 'owner');
create policy "Transaction items manageable by owner" on public.transaction_items for all using ((select role from public.get_current_user_profile()) = 'owner');
create policy "Transaction items insertable by branch cashier" on public.transaction_items for insert with check (
  exists (select 1 from public.transactions t where t.id = transaction_id and t.branch_id = (select branch_id from public.get_current_user_profile()))
);
create policy "Transaction items viewable by branch cashier" on public.transaction_items for select using (
  exists (select 1 from public.transactions t where t.id = transaction_id and t.branch_id = (select branch_id from public.get_current_user_profile()))
);

-- 10, 11, 12, 13. expenses, incomes, suppliers, restocks
create policy "Expenses manageable by owner only" on public.expenses for all using ((select role from public.get_current_user_profile()) = 'owner');
create policy "Incomes manageable by owner only" on public.incomes for all using ((select role from public.get_current_user_profile()) = 'owner');
create policy "Suppliers manageable by owner only" on public.suppliers for all using ((select role from public.get_current_user_profile()) = 'owner');
create policy "Restocks manageable by owner only" on public.restocks for all using ((select role from public.get_current_user_profile()) = 'owner');
