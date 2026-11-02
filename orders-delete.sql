-- Win Auto: видалення замовлень з адмін-панелі (лише адміністратор).
-- Виконується один раз у Supabase → SQL Editor.
drop policy if exists "admin deletes orders" on public.orders;
create policy "admin deletes orders" on public.orders for delete to authenticated
  using (public.my_role() = 'admin');
grant delete on public.orders to authenticated;
