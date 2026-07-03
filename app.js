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
export async function crearTicket(datos, archivos) {
  const { data: ticket, error } = await sb
    .from("tickets")
    .insert(datos)
    .select()
    .single();
  if (error) throw error;

  if (archivos && archivos.length) {
    for (const file of archivos) {
      const path = `${ticket.id}/${Date.now()}-${file.name}`;
      const up = await sb.storage.from("adjuntos").upload(path, file);
      if (!up.error) {
        await sb.from("adjuntos").insert({ ticket_id: ticket.id, path, nombre: file.name });
      }
    }
  }
  return ticket;
}

// ---------- Vecino: login sin contraseña (link mágico) ----------
export async function enviarLinkMagico(email) {
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + "/seguimiento.html" },
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
