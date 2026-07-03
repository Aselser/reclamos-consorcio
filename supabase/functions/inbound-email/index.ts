// ============================================================
//  inbound-email — recibe el webhook de un email entrante y lo
//  convierte en un ticket. Pensado para Postmark Inbound (JSON),
//  también sirve con Mailgun/Cloudflare adaptando los nombres.
//
//  Deploy:  supabase functions deploy inbound-email --no-verify-jwt
//  Secrets: supabase secrets set SB_URL=... SB_SERVICE_ROLE=...
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SB_URL")!,
  Deno.env.get("SB_SERVICE_ROLE")!, // service role: puede insertar saltando RLS
);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  let m: Record<string, unknown> = {};
  try { m = await req.json(); } catch { return new Response("bad json", { status: 400 }); }

  // Campos típicos de Postmark Inbound
  const from = (m.FromFull as any)?.Email ?? m.From ?? "";
  const fromName = (m.FromFull as any)?.Name ?? "";
  const subject = (m.Subject as string) ?? "(sin asunto)";
  const body = (m.TextBody as string) ?? (m.StrippedTextReply as string) ?? "";

  // Crear el ticket
  const { data: ticket, error } = await supabase
    .from("tickets")
    .insert({
      tipo: "consulta",              // por mail entra como consulta; el admin lo reclasifica
      detalle: `${subject}\n\n${body}`.trim(),
      vecino_nombre: fromName || from,
      vecino_email: from,
      origen: "email",
    })
    .select()
    .single();

  if (error) return new Response(JSON.stringify(error), { status: 500 });

  // Adjuntos (base64 en Postmark)
  const attachments = (m.Attachments as any[]) ?? [];
  for (const a of attachments) {
    try {
      const bytes = Uint8Array.from(atob(a.Content), (c) => c.charCodeAt(0));
      const path = `${ticket.id}/${Date.now()}-${a.Name}`;
      const up = await supabase.storage.from("adjuntos")
        .upload(path, bytes, { contentType: a.ContentType });
      if (!up.error) {
        await supabase.from("adjuntos").insert({ ticket_id: ticket.id, path, nombre: a.Name });
      }
    } catch (_) { /* ignora un adjunto que falle */ }
  }

  return new Response(JSON.stringify({ ok: true, codigo: ticket.codigo }), {
    headers: { "content-type": "application/json" },
  });
});
