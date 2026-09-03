import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { phone, fileUrl, caption, fileName, fileType } = await req.json();
    if (!phone || !fileUrl) return Response.json({ error: 'phone e fileUrl são obrigatórios' }, { status: 400 });

    const instanceId = secrets.get("ZAPI_INSTANCE_ID");
    const token = secrets.get("ZAPI_TOKEN");
    const clientToken = secrets.get("ZAPI_CLIENT_TOKEN");

    // Follow redirects to get the final CDN URL
    let resolvedUrl = fileUrl;
    try {
      const headRes = await fetch(fileUrl, { method: "HEAD", redirect: "follow" });
      if (headRes.url && headRes.url !== fileUrl) {
        resolvedUrl = headRes.url;
      }
    } catch (e) {
      // use original URL
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

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Client-Token": clientToken },
      body: JSON.stringify(body),
    });

    const rawText = await res.text();
    let data;
    try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }

    if (!res.ok) return Response.json({ error: data?.error || "Erro Z-API", details: data, status: res.status, fileUrl }, { status: res.status });

    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}