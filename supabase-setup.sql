-- Win Auto: таблиці та правила доступу для замовлень і ролей.
-- Виконайте цей файл один раз у Supabase: SQL Editor → New query → вставити → Run.

-- Ролі співробітників: admin (адміністратор), manager (менеджер), accountant (бухгалтер)
create table if not exists public.profiles (
  id   uuid primary key references auth.users (id) on delete cascade,
  name text,
  role text not null check (role in ('admin', 'manager', 'accountant'))
);

-- Замовлення із сайту
create table if not exists public.orders (
  id           text primary key,
  created_at   timestamptz not null default now(),
  name         text not null,
  phone        text not null,
  carrier      text,
  city         text,
  warehouse    text,
  pay          text,
  note         text,
  items        jsonb not null default '[]',
  total        numeric not null default 0,
  -- заповнює менеджер
  status       text not null default 'new' check (status in ('new', 'confirmed', 'shipped', 'done', 'cancelled')),
  ttn          text,
  manager_note text,
  -- заповнює бухгалтер
  paid         boolean not null default false,
  paid_at      timestamptz,
  invoice      text
);

alter table public.profiles enable row level security;
alter table public.orders   enable row level security;

-- Роль поточного користувача
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

-- Кожен співробітник бачить лише свій профіль
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select to authenticated using (id = auth.uid());

-- Покупець (без входу) може тільки створити замовлення; читати чи змінювати — ні
drop policy if exists "anyone can place an order" on public.orders;
create policy "anyone can place an order" on public.orders for insert to anon, authenticated
  with check (status = 'new' and paid = false and ttn is null and invoice is null);

-- Співробітники з роллю бачать усі замовлення
drop policy if exists "staff read orders" on public.orders;
create policy "staff read orders" on public.orders for select to authenticated
  using (public.my_role() in ('admin', 'manager', 'accountant'));

-- Змінювати замовлення можуть співробітники; хто які поля — перевіряє тригер нижче
drop policy if exists "staff update orders" on public.orders;
create policy "staff update orders" on public.orders for update to authenticated
  using (public.my_role() in ('admin', 'manager', 'accountant'))
  with check (public.my_role() in ('admin', 'manager', 'accountant'));

-- Менеджер змінює лише статус, ТТН і нотатку; бухгалтер — лише оплату й документ; адміністратор — усе
create or replace function public.orders_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text := public.my_role();
begin
  if r = 'admin' then return new; end if;
  if (new.id, new.created_at, new.name, new.phone, new.carrier, new.city, new.warehouse, new.pay, new.note, new.items, new.total)
     is distinct from
     (old.id, old.created_at, old.name, old.phone, old.carrier, old.city, old.warehouse, old.pay, old.note, old.items, old.total) then
    raise exception 'Змінювати дані замовлення може лише адміністратор';
  end if;
  if r = 'manager' and (new.paid, new.paid_at, new.invoice) is distinct from (old.paid, old.paid_at, old.invoice) then
    raise exception 'Менеджер не може змінювати дані про оплату';
  end if;
  if r = 'accountant' and (new.status, new.ttn, new.manager_note) is distinct from (old.status, old.ttn, old.manager_note) then
    raise exception 'Бухгалтер не може змінювати статус замовлення';
  end if;
  return new;
end $$;

drop trigger if exists orders_guard on public.orders;
create trigger orders_guard before update on public.orders
  for each row execute function public.orders_guard();

-- Після створення користувачів (Authentication → Users → Add user) призначте їм ролі, наприклад:
-- insert into public.profiles (id, name, role)
--   select id, 'Ім''я', 'admin' from auth.users where email = 'ваша-пошта@example.com';

-- ============================================================
-- Оптові клієнти: реєстрація з модерацією та персональна знижка
-- ============================================================
create table if not exists public.wholesale_clients (
  id          uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  last_name   text not null,
  first_name  text not null,
  business_type text check (business_type in ('СТО', 'Розборка', 'Інтернет-магазин', 'Дилер', 'Автопарк')),
  company     text,
  address     text not null,
  phone       text not null,
  email       text not null,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  discount    numeric not null default 0 check (discount >= 0 and discount <= 90),
  approved_at timestamptz
);
alter table public.wholesale_clients enable row level security;
-- для бази, створеної раніше без цього поля
alter table public.wholesale_clients add column if not exists business_type text;

-- клієнт подає заявку лише від свого імені й лише «на модерацію» без знижки
drop policy if exists "client applies" on public.wholesale_clients;
create policy "client applies" on public.wholesale_clients for insert to authenticated
  with check (id = auth.uid() and status = 'pending' and discount = 0);
-- клієнт бачить свою заявку, адміністратор — усі
drop policy if exists "client or admin reads" on public.wholesale_clients;
create policy "client or admin reads" on public.wholesale_clients for select to authenticated
  using (id = auth.uid() or public.my_role() = 'admin');
-- змінювати статус і знижку може лише адміністратор
drop policy if exists "admin updates" on public.wholesale_clients;
create policy "admin updates" on public.wholesale_clients for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- Замовлення: хто замовив і з якою знижкою
alter table public.orders add column if not exists customer_id uuid references auth.users (id);
alter table public.orders add column if not exists discount numeric not null default 0;
alter table public.orders add column if not exists total_base numeric;

-- замовлення від клієнта можна прив'язати лише до власного акаунта
drop policy if exists "anyone can place an order" on public.orders;
create policy "anyone can place an order" on public.orders for insert to anon, authenticated
  with check (status = 'new' and paid = false and ttn is null and invoice is null
              and (customer_id is null or customer_id = auth.uid()));
-- клієнт бачить власні замовлення (для кабінету)
drop policy if exists "client reads own orders" on public.orders;
create policy "client reads own orders" on public.orders for select to authenticated
  using (customer_id = auth.uid());

-- Знижка в замовленні не може перевищувати знижку, яку клієнту призначив адміністратор
create or replace function public.orders_discount_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare allowed numeric := 0;
begin
  if new.customer_id is not null then
    select coalesce(discount, 0) into allowed from public.wholesale_clients
      where id = new.customer_id and status = 'approved';
  end if;
  if coalesce(new.discount, 0) > coalesce(allowed, 0) then
    raise exception 'Знижка перевищує дозволену для цього клієнта';
  end if;
  return new;
end $$;
drop trigger if exists orders_discount_guard on public.orders;
create trigger orders_discount_guard before insert on public.orders
  for each row execute function public.orders_discount_guard();

-- Доступ сайту до таблиць (які саме рядки — визначають правила вище)
grant usage on schema public to anon, authenticated;
grant insert on public.orders to anon;
grant select, insert, update on public.orders to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.wholesale_clients to authenticated;
grant execute on function public.my_role() to anon, authenticated;
