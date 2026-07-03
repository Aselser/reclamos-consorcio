# Reclamos del Consorcio — puesta en marcha

Sistema de reclamos + comprobantes para el consorcio. Front estático (3 páginas)
+ backend Supabase (base de datos, login mágico, storage, email entrante).

## Qué hace cada página
| Archivo | Para quién | Login |
|---|---|---|
| `cargar.html` | Vecinos | Sin login |
| `seguimiento.html` | Vecinos | Link mágico (sin contraseña) |
| `admin.html` | Los admin | Email + contraseña |

---

## Paso 1 — Crear el proyecto en Supabase (5 min)
1. Entrá a https://supabase.com → **New project** (plan free).
2. Cuando termine, andá a **Project Settings → API** y copiá:
   - **Project URL**
   - **anon public key**
3. Pegá esos dos valores en `config.js`.

## Paso 2 — Crear las tablas
1. En Supabase, **SQL Editor → New query**.
2. Pegá **todo** el contenido de `db/schema.sql` y tocá **Run**.
   Esto crea las tablas, la seguridad (RLS) y el bucket `adjuntos`.

## Paso 3 — Activar el login mágico de los vecinos
- **Authentication → Providers → Email**: dejalo activado.
- **Authentication → URL Configuration**: agregá la URL donde vas a publicar
  (ver Paso 5) en *Site URL* y en *Redirect URLs*
  (ej: `https://reclamos-consorcio.netlify.app/seguimiento.html`).

## Paso 4 — Dar de alta a los admin
1. Que cada admin entre una vez a `admin.html` e intente registrarse, **o**
   crealos vos en **Authentication → Users → Add user** (email + contraseña).
2. Copiá el **UUID** de cada uno (columna de la lista de usuarios).
3. En **SQL Editor** corré, por cada admin:
   ```sql
   insert into public.admins (user_id, nombre) values ('UUID-DEL-USUARIO', 'Juan');
   ```
   Solo los que estén en esta tabla ven el tablero.

## Paso 5 — Publicar el front (deploy)
Cualquier hosting estático sirve. El más rápido:

**Netlify (drag & drop):**
1. Entrá a https://app.netlify.com/drop
2. Arrastrá la carpeta `reclamos-consorcio` entera.
3. Te da una URL pública al toque. Copiala al Paso 3.

**Alternativas:** Vercel, Cloudflare Pages, o GitHub Pages (como el flyer).

> Después de deployar, si cambiás la URL, actualizá *Redirect URLs* en Supabase.

---

## Paso 6 — Email entrante (mail → ticket)
Necesita un **dominio** para la casilla (ej: `reclamos@tuconsorcio.com`).

### Opción recomendada: Postmark Inbound (gratis para recibir)
1. Creá cuenta en https://postmarkapp.com → **Servers → Inbound**.
2. Postmark te da una dirección tipo `xxxx@inbound.postmarkapp.com`.
   Configurá en tu dominio un reenvío de `reclamos@tuconsorcio.com` → esa dirección
   (o apuntá el MX si querés recibir directo).
3. Deploy de la función que recibe el mail:
   ```bash
   npm i -g supabase
   supabase login
   supabase link --project-ref TU-REF
   supabase secrets set SB_URL="https://TU-PROYECTO.supabase.co" SB_SERVICE_ROLE="TU_SERVICE_ROLE_KEY"
   supabase functions deploy inbound-email --no-verify-jwt
   ```
   (`service_role` está en Project Settings → API. **NO** la pongas en `config.js`,
   es secreta — solo va en la función.)
4. En Postmark, **Inbound webhook** apuntá a:
   `https://TU-PROYECTO.supabase.co/functions/v1/inbound-email`

> Los mails entran como ticket tipo "consulta" y el admin los reclasifica.

### Alternativa gratis con dominio propio: Cloudflare Email Routing
Si el dominio está en Cloudflare, podés usar **Email Routing + Email Worker**
que llame a la misma función. Avisame y te paso ese worker.

---

## Probar local
Abrí la carpeta con cualquier server estático, ej:
```bash
npx serve reclamos-consorcio
```
(Con `file://` el login no funciona; necesita http.)

## Costos
Supabase free + Netlify free + Postmark (inbound gratis) → **$0** para el volumen
de un consorcio. Si algún día crece, se escala pagando solo lo que uses.
