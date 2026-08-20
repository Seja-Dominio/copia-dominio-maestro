import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { phone, fileUrl, caption, fileName, fileType } = await req.json();
    if (!phone || !fileUrl) return Response.json({ error: 'phone e fileUrl são obrigatórios' }, { status: 400 });

    const instanceId = Deno.env.get("ZAPI_INSTANCE_ID");
    const token = Deno.env.get("ZAPI_TOKEN");

    const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");

    // === FIX: Follow redirects to get the final CDN URL ===
    // Base44 URLs (base44.app) return 302 redirects to CDN (media.base44.com / supabase.co).
    // Z-API does NOT follow redirects, so we resolve the final URL here.
    let resolvedUrl = fileUrl;
    try {
      const headRes = await fetch(fileUrl, { method: "HEAD", redirect: "follow" });
      if (headRes.url && headRes.url !== fileUrl) {
        resolvedUrl = headRes.url;
        console.log("Resolved redirect:", fileUrl, "->", resolvedUrl);
      }
    } catch (e) {
      console.log("Redirect resolve failed, using original URL:", e.message);
    }

    const isImage = fileType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(fileUrl);

    let endpoint, body;

    if (isImage) {
      endpoint = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-image`;
      body = { phone, image: resolvedUrl, caption: caption || "" };
    } else {
      endpoint = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-document/url`;
      body = { phone, url: resolvedUrl, caption: caption || "", fileName: fileName || "arquivo" };
    }

    console.log("=== SEND WHATSAPP FILE ===");
    console.log("originalUrl:", fileUrl);
    console.log("resolvedUrl:", resolvedUrl);
    console.log("isImage:", isImage);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Client-Token": clientToken },
      body: JSON.stringify(body),
    });

    const rawText = await res.text();
    console.log("Z-API response status:", res.status);
    console.log("Z-API response body:", rawText);

    let data;
    try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }

    if (!res.ok) return Response.json({ error: data?.error || "Erro Z-API", details: data, status: res.status, fileUrl }, { status: res.status });

    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});