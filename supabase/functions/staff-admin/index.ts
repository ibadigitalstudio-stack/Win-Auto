// Win Auto: керування працівниками з адмін-панелі (лише для адміністратора).
// Створення облікових записів потребує службового ключа, тому це робить серверна функція,
// а не сторінка в браузері. Ключ SUPABASE_SERVICE_ROLE_KEY Supabase підставляє сам.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const ROLES = ['admin', 'manager', 'accountant'];
const PERMS = ['orders_manage', 'accounting', 'wholesale', 'catalog', 'site'];
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (msg: string, status = 400) => json({ error: msg }, status);
const cleanPerms = (p: unknown) => Array.isArray(p) ? [...new Set(p.filter((x) => PERMS.includes(String(x))).map(String))] : [];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

    // хто звертається: лише активний адміністратор
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who } = await db.auth.getUser(token);
    if (!who?.user) return fail('Увійдіть знову.', 401);
    const { data: me } = await db.from('profiles').select('role,active,perms').eq('id', who.user.id).maybeSingle();
    if (!me || me.active === false) return fail('Немає доступу.', 403);
    const b = await req.json();

    // Оптовий клієнт, доданий вручну: адміністратор або працівник із правом «Оптові клієнти»
    if (b.action === 'client_create') {
      if (me.role !== 'admin' && !(me.perms || []).includes('wholesale')) return fail('Немає права додавати оптових клієнтів.', 403);
      const email = String(b.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Вкажіть правильний e-mail.');
      if (String(b.password || '').length < 8) return fail('Пароль має містити щонайменше 8 символів.');
      for (const k of ['last_name', 'first_name', 'address', 'phone']) if (!String(b[k] || '').trim()) return fail('Заповніть прізвище, ім\'я, адресу й телефон.');
      const discount = Number(b.discount) || 0;
      if (discount < 0 || discount > 90) return fail('Знижка має бути від 0 до 90%.');
      const types = ['СТО', 'Розборка', 'Інтернет-магазин', 'Дилер', 'Автопарк'];
      const { data: created, error } = await db.auth.admin.createUser({ email, password: b.password, email_confirm: true });
      if (error || !created?.user) return fail(error?.message?.includes('already') ? 'Користувач із таким e-mail уже існує.' : (error?.message || 'Не вдалося створити обліковий запис.'));
      const { error: e2 } = await db.from('wholesale_clients').insert({
        id: created.user.id, email, status: 'approved', discount, approved_at: new Date().toISOString(),
        last_name: String(b.last_name).trim(), first_name: String(b.first_name).trim(),
        business_type: types.includes(b.business_type) ? b.business_type : null,
        company: String(b.company || '').trim() || null, address: String(b.address).trim(), phone: String(b.phone).trim()
      });
      if (e2) { await db.auth.admin.deleteUser(created.user.id); return fail(e2.message); }
      return json({ ok: true, id: created.user.id });
    }

    if (me.role !== 'admin') return fail('Лише адміністратор може керувати працівниками.', 403);
    const activeAdmins = async () => {
      const { count } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('active', true);
      return count || 0;
    };

    if (b.action === 'list') {
      const { data: profiles } = await db.from('profiles').select('*');
      const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
      const byId = new Map((list?.users || []).map((u) => [u.id, u]));
      return json((profiles || []).map((p) => ({
        id: p.id, name: p.name, role: p.role, perms: p.perms || [], active: p.active !== false,
        email: byId.get(p.id)?.email || p.email, last_sign_in_at: byId.get(p.id)?.last_sign_in_at || null
      })));
    }

    if (b.action === 'create') {
      const email = String(b.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Вкажіть правильний e-mail.');
      if (String(b.password || '').length < 8) return fail('Пароль має містити щонайменше 8 символів.');
      if (!ROLES.includes(b.role)) return fail('Оберіть роль.');
      const { data: created, error } = await db.auth.admin.createUser({ email, password: b.password, email_confirm: true });
      if (error || !created?.user) return fail(error?.message?.includes('already') ? 'Користувач із таким e-mail уже існує.' : (error?.message || 'Не вдалося створити користувача.'));
      const { error: e2 } = await db.from('profiles').insert({
        id: created.user.id, email, name: String(b.name || '').trim() || email, role: b.role, perms: cleanPerms(b.perms), active: true
      });
      if (e2) { await db.auth.admin.deleteUser(created.user.id); return fail(e2.message); }
      return json({ ok: true, id: created.user.id });
    }

    if (!b.id) return fail('Не вказано працівника.');
    const self = b.id === who.user.id;

    if (b.action === 'update') {
      const patch: Record<string, unknown> = {};
      if (b.name !== undefined) patch.name = String(b.name).trim();
      if (b.role !== undefined) { if (!ROLES.includes(b.role)) return fail('Невідома роль.'); patch.role = b.role; }
      if (b.perms !== undefined) patch.perms = cleanPerms(b.perms);
      if (b.active !== undefined) patch.active = !!b.active;
      if (self && (patch.role && patch.role !== 'admin' || patch.active === false)) return fail('Не можна зняти права адміністратора із самого себе.');
      const { data: cur } = await db.from('profiles').select('role,active').eq('id', b.id).maybeSingle();
      if (cur?.role === 'admin' && cur.active && ((patch.role && patch.role !== 'admin') || patch.active === false) && await activeAdmins() <= 1) {
        return fail('Має лишитися хоча б один активний адміністратор.');
      }
      const { error } = await db.from('profiles').update(patch).eq('id', b.id);
      return error ? fail(error.message) : json({ ok: true });
    }

    if (b.action === 'password') {
      if (String(b.password || '').length < 8) return fail('Пароль має містити щонайменше 8 символів.');
      const { error } = await db.auth.admin.updateUserById(b.id, { password: b.password });
      return error ? fail(error.message) : json({ ok: true });
    }

    if (b.action === 'delete') {
      if (self) return fail('Не можна видалити самого себе.');
      const { data: cur } = await db.from('profiles').select('role,active').eq('id', b.id).maybeSingle();
      if (cur?.role === 'admin' && cur.active && await activeAdmins() <= 1) return fail('Має лишитися хоча б один активний адміністратор.');
      const { error } = await db.auth.admin.deleteUser(b.id);
      return error ? fail(error.message) : json({ ok: true });
    }

    return fail('Невідома дія.');
  } catch (e) {
    return fail('Помилка сервера: ' + (e instanceof Error ? e.message : String(e)), 500);
  }
});
