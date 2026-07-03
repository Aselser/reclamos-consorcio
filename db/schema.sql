-- ============================================================
--  Reclamos del Consorcio — esquema de base de datos (Supabase)
--  Pegá TODO esto en: Supabase → SQL Editor → New query → Run
-- ============================================================

-- Extensiones (ya suelen venir activas en Supabase)
create extension if not exists pgcrypto;

-- ---------- Administradores ----------
-- Un admin es un usuario de Supabase Auth cuyo id está en esta tabla.
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre  text not null,
  creado  timestamptz not null default now()
);

-- Helper: ¿el usuario logueado es admin?
create or replace function public.es_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

-- ---------- Tickets ----------
create table if not exists public.tickets (
  id           uuid primary key default gen_random_uuid(),
  codigo       text not null default upper(left(md5(gen_random_uuid()::text), 4)),
  tipo         text not null check (tipo in ('reclamo','pago','consulta')),
  estado       text not null default 'nuevo' check (estado in ('nuevo','proceso','verificar','resuelto')),
  torre        text,
  unidad       text,
  categoria    text,                 -- para reclamos (plomería, ascensor, etc.)
  detalle      text,
  mes          text,                 -- para comprobantes de pago (ej: 2026-07)
  monto        numeric,              -- para comprobantes de pago
  vecino_nombre  text,
  vecino_email   text,               -- con esto el vecino ve SUS tickets (link mágico)
  vecino_contacto text,              -- whatsapp u otro
  origen       text not null default 'web' check (origen in ('web','email')),
  asignado_a   uuid references public.admins(user_id),
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now()
);
create index if not exists idx_tickets_email  on public.tickets (lower(vecino_email));
create index if not exists idx_tickets_estado on public.tickets (estado);

-- ---------- Comentarios / notas ----------
create table if not exists public.comentarios (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.tickets(id) on delete cascade,
  autor      text not null,
  cuerpo     text not null,
  interno    boolean not null default true,   -- true = nota interna (el vecino NO la ve)
  creado     timestamptz not null default now()
);
create index if not exists idx_coment_ticket on public.comentarios (ticket_id);

-- ---------- Adjuntos ----------
-- El archivo vive en Storage (bucket 'adjuntos'); acá guardamos la referencia.
create table if not exists public.adjuntos (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.tickets(id) on delete cascade,
  path       text not null,
  nombre     text,
  creado     timestamptz not null default now()
);
create index if not exists idx_adj_ticket on public.adjuntos (ticket_id);

-- ============================================================
--  Row Level Security (RLS)
-- ============================================================
alter table public.tickets     enable row level security;
alter table public.comentarios enable row level security;
alter table public.adjuntos    enable row level security;
alter table public.admins      enable row level security;

-- Admins: cada uno lee su propia fila; nadie más
create policy admins_self on public.admins
  for select using (user_id = auth.uid());

-- TICKETS ---------------------------------------------------
-- Crear: cualquiera (el vecino carga sin login) o el webhook de email
create policy tickets_insert on public.tickets
  for insert with check (true);

-- Ver: admins todo; vecino solo los suyos (por email del link mágico)
create policy tickets_select on public.tickets
  for select using (
    public.es_admin()
    or lower(vecino_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- Modificar (estado, asignar): solo admins
create policy tickets_update on public.tickets
  for update using (public.es_admin()) with check (public.es_admin());

-- COMENTARIOS ----------------------------------------------
-- Ver: admins todo; vecino solo los NO internos de sus propios tickets
create policy coment_select on public.comentarios
  for select using (
    public.es_admin()
    or (
      interno = false
      and exists (
        select 1 from public.tickets t
        where t.id = ticket_id
          and lower(t.vecino_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
  );

-- Crear comentarios/notas: solo admins
create policy coment_insert on public.comentarios
  for insert with check (public.es_admin());

-- ADJUNTOS --------------------------------------------------
create policy adj_insert on public.adjuntos
  for insert with check (true);

create policy adj_select on public.adjuntos
  for select using (
    public.es_admin()
    or exists (
      select 1 from public.tickets t
      where t.id = ticket_id
        and lower(t.vecino_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- ============================================================
--  Storage: bucket para comprobantes/fotos
--  (Corré esto también, o creá el bucket 'adjuntos' desde la UI)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('adjuntos', 'adjuntos', false)
on conflict (id) do nothing;

-- Subir archivos: permitido a cualquiera (el vecino sin login)
create policy "adjuntos subir" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'adjuntos');

-- Leer archivos: solo admins (el resto usa URLs firmadas que genera el front)
create policy "adjuntos leer admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'adjuntos' and public.es_admin());

-- ============================================================
--  Para dar de alta a un admin después de que se registre:
--  1) que se registre/loguee una vez en admin.html
--  2) buscá su id en  Authentication → Users
--  3) corré:
--     insert into public.admins (user_id, nombre)
--     values ('EL-UUID-DEL-USUARIO', 'Juan');
-- ============================================================
