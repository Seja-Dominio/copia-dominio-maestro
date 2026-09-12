import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

async function findOrCreateFolder(accessToken, name, parentId) {
  let q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchRes.json();
  
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }
  
  const body = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) body.parents = [parentId];
  
  const folderRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const folderData = await folderRes.json();
  return folderData.id;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    const formData = await req.formData();
    const file = formData.get('file');
    const fileName = formData.get('fileName') || file.name || 'arquivo';
    
    const clientName = formData.get('clientName') || '';
    const projectName = formData.get('projectName') || '';
    const jobTitle = formData.get('jobTitle') || '';

    // Build folder hierarchy: Anexos > [clientName] > [projectName] > [jobTitle]
    let targetFolderId = null;
    targetFolderId = await findOrCreateFolder(accessToken, 'Anexos', null);

    if (clientName) {
      targetFolderId = await findOrCreateFolder(accessToken, clientName, targetFolderId);
    }
    if (projectName) {
      targetFolderId = await findOrCreateFolder(accessToken, projectName, targetFolderId);
    }
    if (jobTitle) {
      targetFolderId = await findOrCreateFolder(accessToken, jobTitle, targetFolderId);
    }

    // Upload the file using multipart upload
    const fileBytes = await file.arrayBuffer();
    const metadata = { name: fileName, parents: [targetFolderId] };

    const boundary = '-------base44boundary';
    const metadataPart = JSON.stringify(metadata);
    
    const encoder = new TextEncoder();
    const parts = [
      encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataPart}\r\n`),
      encoder.encode(`--${boundary}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`),
      new Uint8Array(fileBytes),
      encoder.encode(`\r\n--${boundary}--`),
    ];

    let totalLen = 0;
    for (const p of parts) totalLen += p.byteLength;
    const body = new Uint8Array(totalLen);
    let offset = 0;
    for (const p of parts) { body.set(p, offset); offset += p.byteLength; }

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      return Response.json({ error: 'Upload failed', details: err }, { status: 500 });
    }

    const uploaded = await uploadRes.json();

    // Make the file publicly readable
    await fetch(`https://www.googleapis.com/drive/v3/files/${uploaded.id}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });

    const viewUrl = `https://drive.google.com/file/d/${uploaded.id}/view`;
    const directUrl = `https://drive.google.com/uc?export=view&id=${uploaded.id}`;
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${uploaded.id}`;

    return Response.json({
      id: uploaded.id,
      name: uploaded.name,
      viewUrl,
      directUrl,
      downloadUrl,
      webViewLink: uploaded.webViewLink,
    });
  } catch (error) {
    console.error("[ERROR]", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}