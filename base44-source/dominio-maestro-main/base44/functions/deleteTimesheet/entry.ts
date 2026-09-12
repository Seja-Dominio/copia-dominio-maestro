import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { timesheetId } = await req.json();
    
    if (!timesheetId) {
      return Response.json({ error: 'timesheetId required' }, { status: 400 });
    }

    // Buscar o timesheet
    const timesheet = await base44.entities.Timesheet.get(timesheetId);
    if (!timesheet) {
      return Response.json({ error: 'Timesheet not found' }, { status: 404 });
    }

    // Buscar colaborador logado
    const collaborator = await base44.asServiceRole.entities.Collaborator.filter({ id: user.id });
    const isAdmin = collaborator.length > 0 && collaborator[0].access_level === 'admin';

    if (!isAdmin) {
      return Response.json({ error: 'Forbidden: Only admins can delete timesheets' }, { status: 403 });
    }

    // Criar log de exclusão
    await base44.asServiceRole.entities.DeleteLog.create({
      entity_type: 'timesheet',
      entity_id: timesheetId,
      entity_data: timesheet,
      deleted_by: user.id,
      deleted_by_name: user.full_name,
      deleted_at: new Date().toISOString(),
      reason: ''
    });

    // Deletar o timesheet
    await base44.entities.Timesheet.delete(timesheetId);

    return Response.json({ success: true, message: 'Timesheet deleted and logged' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}