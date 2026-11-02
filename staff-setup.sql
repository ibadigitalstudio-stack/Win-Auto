-- Win Auto: працівники, ролі та індивідуальні додаткові права.
-- Виконується один раз у Supabase → SQL Editor (після supabase-setup.sql).

-- Додаткові поля профілю працівника
alter table public.profiles add column if not exists email  text;
alter table public.profiles add column if not exists perms  text[] not null default '{}';
alter table public.profiles add column if not exists active boolean not null default true;

-- Роль поточного користувача (вимкнений працівник ролі не має)
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() and active $$;

-- Чи має поточний працівник право: за роллю або як додаткове право від адміністратора
--   orders_manage — обробка замовлень (статус, ТТН, нотатки)
--   accounting    — облік і оплати
--   wholesale     — оптові клієнти та знижки
--   catalog       — товари й ціни
--   site          — контакти, тексти, реквізити, аналітика
create or replace function public.can(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select active and (
      role = 'admin'
      or (p = 'orders_manage' and role = 'manager')
      or (p = 'accounting'    and role = 'accountant')
      or p = any (perms))
    from public.profiles where id = auth.uid()), false)
$$;
grant execute on function public.can(text) to authenticated;

-- Хто що може змінювати в замовленні
create or replace function public.orders_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.my_role() = 'admin' then return new; end if;   -- сервер (оплата monobank) або адміністратор
  if (new.id, new.created_at, new.name, new.phone, new.carrier, new.city, new.warehouse, new.pay, new.note, new.items, new.total)
     is distinct from
     (old.id, old.created_at, old.name, old.phone, old.carrier, old.city, old.warehouse, old.pay, old.note, old.items, old.total) then
    raise exception 'Змінювати дані замовлення може лише адміністратор';
  end if;
  if not public.can('orders_manage') and (new.status, new.ttn, new.manager_note) is distinct from (old.status, old.ttn, old.manager_note) then
    raise exception 'Немає права змінювати статус замовлення';
  end if;
  if not public.can('accounting') and (new.paid, new.paid_at, new.invoice) is distinct from (old.paid, old.paid_at, old.invoice) then
    raise exception 'Немає права змінювати дані про оплату';
  end if;
  return new;
end $$;

-- Оптові клієнти: адміністратор або працівник із правом «wholesale»
drop policy if exists "client or admin reads" on public.wholesale_clients;
create policy "client or admin reads" on public.wholesale_clients for select to authenticated
  using (id = auth.uid() or public.can('wholesale'));
drop policy if exists "admin updates" on public.wholesale_clients;
create policy "admin updates" on public.wholesale_clients for update to authenticated
  using (public.can('wholesale')) with check (public.can('wholesale'));

-- Заповнити e-mail для вже доданих працівників
update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;
