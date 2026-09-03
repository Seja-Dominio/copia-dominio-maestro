import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { verifyPassword } from '../../shared/passwordHash.ts';

export default async function(req) {
  try {
    const { login, password } = await req.json();

    if (!login || !password) {
      return Response.json({ error: 'Login e senha são obrigatórios' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    const collaborators = await base44.asServiceRole.entities.Collaborator.list('name', 200);

    // Encontrar por login (case-insensitive)
    const collaborator = collaborators.find(
      c => c.login && c.login.toLowerCase() === login.trim().toLowerCase()
    );

    if (!collaborator) {
      return Response.json({ error: 'Usuário ou senha incorretos' }, { status: 401 });
    }

    // Bloquear colaboradores inativos
    if (collaborator.is_active === false) {
      return Response.json({ error: 'Sua conta está desativada. Contate o administrador.' }, { status: 403 });
    }

    // Validar senha (suporta hash SHA-256 e legado plaintext)
    const passwordValid = await verifyPassword(password, collaborator.password_hash || "");
    if (!passwordValid) {
      return Response.json({ error: 'Usuário ou senha incorretos' }, { status: 401 });
    }

    // Retornar dados do colaborador (sem a senha)
    return Response.json({
      success: true,
      collaborator: {
        id: collaborator.id,
        name: collaborator.name,
        email: collaborator.email,
        login: collaborator.login,
        access_level: collaborator.access_level,
        avatar_url: collaborator.avatar_url,
        permissions: collaborator.permissions,
      }
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}