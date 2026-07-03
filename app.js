// ============================================================
//  app.js — cliente Supabase + helpers compartidos por las 3 páginas
//  Se carga después de config.js y del SDK de Supabase (CDN).
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const sb = createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_ANON_KEY);

const ESTADOS = {
  nuevo:     { txt: "Nuevo",           cls: "new"  },
  proceso:   { txt: "En proceso",      cls: "proc" },
  verificar: { txt: "A verificar",     cls: "proc" },
  resuelto:  { txt: "Resuelto",        cls: "done" },
};
export function estadoChip(estado) {
  const e = ESTADOS[estado] || ESTADOS.nuevo;
  return `<span class="chip ${e.cls}"><span class="dot"></span>${e.txt}</span>`;
}
export function fmtFecha(iso) {
  try { return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" }); }
  catch { return iso; }
}
export function fmtMonto(n) {
  if (n == null) return "";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);
}

// ---------- Vecino: crear un ticket (sin login) ----------
// Generamos id y código en el cliente: el vecino anónimo puede INSERTAR
// pero la seguridad (RLS) no lo deja LEER la fila de vuelta, así que no
// dependemos de que la base nos devuelva nada.
export async function crearTicket(datos, archivos) {
  const id = crypto.randomUUID();
  const codigo = Array.from(crypto.getRandomValues(new Uint8Array(2)))
    .map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();

  const { error } = await sb.from("tickets").insert({ ...datos, id, codigo });
  if (error) throw error;

  if (archivos && archivos.length) {
    for (const file of archivos) {
      const path = `${id}/${Date.now()}-${file.name}`;
      const up = await sb.storage.from("adjuntos").upload(path, file);
      if (!up.error) {
        await sb.from("adjuntos").insert({ ticket_id: id, path, nombre: file.name });
      }
    }
  }
  return { id, codigo };
}

// ---------- Vecino: login sin contraseña (link mágico) ----------
export async function enviarLinkMagico(email) {
  // Ruta completa (incluye la subcarpeta /reclamos-consorcio/ en GitHub Pages)
  const redirect = new URL("seguimiento.html", window.location.href).href;
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirect },
  });
  if (error) throw error;
}

// ---------- Vecino: mis tickets (RLS filtra por mi email) ----------
export async function misTickets() {
  const { data, error } = await sb
    .from("tickets")
    .select("*")
    .order("creado", { ascending: false });
  if (error) throw error;
  return data;
}

export async function historialTicket(ticketId) {
  const { data, error } = await sb
    .from("comentarios")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("creado", { ascending: true });
  if (error) throw error;
  return data;
}

// ---------- Admin ----------
export async function loginAdmin(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function sesionActual() {
  const { data } = await sb.auth.getSession();
  return data.session;
}
export async function cerrarSesion() {
  await sb.auth.signOut();
}
export async function todosLosTickets() {
  const { data, error } = await sb
    .from("tickets")
    .select("*")
    .order("creado", { ascending: false });
  if (error) throw error;
  return data;
}
export async function cambiarEstado(ticketId, estado) {
  const { error } = await sb
    .from("tickets")
    .update({ estado, actualizado: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) throw error;
}
export async function agregarComentario(ticketId, autor, cuerpo, interno) {
  const { error } = await sb
    .from("comentarios")
    .insert({ ticket_id: ticketId, autor, cuerpo, interno });
  if (error) throw error;
}
export async function urlAdjunto(path) {
  const { data } = await sb.storage.from("adjuntos").createSignedUrl(path, 3600);
  return data?.signedUrl;
}
