-- Win Auto: поля для онлайн-оплати monobank. Виконується один раз у Supabase → SQL Editor.

alter table public.orders add column if not exists mono_invoice text;
alter table public.orders add column if not exists pay_status   text;
create index if not exists orders_mono_invoice on public.orders (mono_invoice);

-- Покупець не може сам записати статус оплати чи рахунок monobank
drop policy if exists "anyone can place an order" on public.orders;
create policy "anyone can place an order" on public.orders for insert to anon, authenticated
  with check (status = 'new' and paid = false and ttn is null and invoice is null
              and mono_invoice is null and pay_status is null
              and (customer_id is null or customer_id = auth.uid()));

-- Сповіщення в Telegram про оплату (якщо сповіщення вже налаштовано)
create or replace function public.notify_paid() returns trigger
language plpgsql security definer set search_path = public, private, extensions as $$
begin
  if new.paid and not coalesce(old.paid, false) and new.pay = 'mono' then
    perform private.tg_send('💳 Оплачено карткою: замовлення ' || new.id || ' на ' || round(new.total) || ' грн' || E'\n' ||
      new.name || ', ' || new.phone || E'\n\nhttps://win-auto.com.ua/admin.html');
  end if;
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists notify_paid on public.orders;
create trigger notify_paid after update on public.orders
  for each row execute function public.notify_paid();
