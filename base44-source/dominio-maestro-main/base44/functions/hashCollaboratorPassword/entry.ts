import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { hashPassword } from '../../shared/passwordHash.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { collaboratorId, password, login, access_level } = await req.json();

    if (!collaboratorId || !password) {
      return Response.json({ error: 'collaboratorId e password são obrigatórios' }, { status: 400 });
    }

    const hashedPassword = await hashPassword(password);

    const updateData = { password_hash: hashedPassword };
    if (login !== undefined) updateData.login = login;
    if (access_level !== undefined) updateData.access_level = access_level;

    await base44.asServiceRole.entities.Collaborator.update(collaboratorId, updateData);

    return Response.json({ success: true });
  } catch (error) {
    console.error("hashCollaboratorPassword error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}