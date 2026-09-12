import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Manaus' });
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Manaus' });
    const d90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch all relevant data
    const [clients, projects, jobs, collaborators, subtasks, feeContracts, templates, appConfigs, squads, bankAccounts, costCenters] = await Promise.all([
      base44.asServiceRole.entities.Client.filter({}, 'name', 500),
      base44.asServiceRole.entities.Project.filter({}, '-created_date', 500),
      base44.asServiceRole.entities.Job.filter({}, '-post_date', 5000),
      base44.asServiceRole.entities.Collaborator.filter({}, 'name', 200),
      base44.asServiceRole.entities.Subtask.filter({}, '-deadline', 5000),
      base44.asServiceRole.entities.FeeContract.filter({}, '-created_date', 200),
      base44.asServiceRole.entities.JobTemplate.filter({}, 'name', 200),
      base44.asServiceRole.entities.AppConfig.filter({}, 'key', 100),
      base44.asServiceRole.entities.Squad.filter({}, 'name', 100),
      base44.asServiceRole.entities.BankAccount.filter({}, 'name', 50),
      base44.asServiceRole.entities.CostCenter.filter({}, 'name', 50),
    ]);

    // Fetch last 90 days data
    const [jobHistory, timesheets, financialEntries, deleteLogs] = await Promise.all([
      base44.asServiceRole.entities.JobHistory.filter({ created_date: { $gte: d90 } }, '-created_date', 5000),
      base44.asServiceRole.entities.Timesheet.filter({ created_date: { $gte: d90 } }, '-created_date', 5000),
      base44.asServiceRole.entities.FinancialEntry.filter({}, '-due_date', 5000),
      base44.asServiceRole.entities.DeleteLog.filter({ created_date: { $gte: d90 } }, '-deleted_at', 500),
    ]);

    const statusLabels = {
      pending_briefing: 'Aguard. Briefing', pending_capture: 'Aguard. Captação',
      pending_design: 'Aguard. Design', pending_edit: 'Aguard. Edição',
      internal_approval: 'Aprov. Interna', client_approval: 'Aprov. Cliente',
      scheduled: 'Agendado', completed: 'Concluído', cancelled: 'Cancelado',
    };
    const contentLabels = {
      feed_card: 'Card', reels: 'Reels', story: 'Stories', video: 'Vídeo',
      trafego_pago: 'Tráfego Pago', card_trafego: 'Card Tráfego',
      video_trafego: 'Vídeo Tráfego', foto: 'Foto', promocao: 'Promoção',
      email: 'Email', blog: 'Blog', outros: 'Outros',
    };

    // Index helpers
    const jobsByProject = {};
    const jobsByClient = {};
    jobs.forEach(j => {
      if (j.project_id) { (jobsByProject[j.project_id] ||= []).push(j); }
      if (j.client_id) { (jobsByClient[j.client_id] ||= []).push(j); }
    });
    const subtasksByJob = {};
    subtasks.forEach(s => { (subtasksByJob[s.job_id] ||= []).push(s); });
    const contractsByClient = {};
    feeContracts.forEach(fc => { if (fc.client_id) (contractsByClient[fc.client_id] ||= []).push(fc); });

    let md = `# 🏗️ DOMÍNIO MAESTRO — Blueprint Completo para Rebuild\n`;
    md += `> Gerado em: ${now}\n`;
    md += `> Este documento contém TODAS as informações necessárias para reconstruir 100% do sistema.\n`;
    md += `> Inclui dados operacionais atuais e histórico dos últimos 90 dias.\n\n`;

    // ════════════════════════════════════════════════════════════════
    // PARTE 1: ESTRUTURA DO SISTEMA (REBUILD)
    // ════════════════════════════════════════════════════════════════

    md += `---\n## 📋 Visão Geral do Sistema\n\n`;
    md += `**Nome:** Domínio Maestro — Sistema Operacional de Gestão de Agências de Marketing\n`;
    md += `**Stack:** React 18 + Tailwind CSS + Vite + Base44 BaaS\n`;
    md += `**Banco de dados:** Base44 Entities (NoSQL schemaless com JSON Schema)\n`;
    md += `**Backend:** Base44 Backend Functions (Deno Workers)\n`;
    md += `**Autenticação:** Customizada via Collaborator entity (login/password_hash) + Auth Provider Base44\n`;
    md += `**Fuso Horário:** America/Manaus (GMT-4)\n\n`;

    md += `---\n## 🛠️ Linguagens e Tecnologias por Camada\n\n`;
    md += `| Camada | Tecnologia | Versão | Notas |\n|---|---|---|---|\n`;
    md += `| Frontend (UI) | React + JSX | 18.2 | Componentes funcionais com hooks |\n`;
    md += `| Estilização | Tailwind CSS | 3.x | Design tokens via CSS variables em index.css |\n`;
    md += `| Componentes UI | shadcn/ui (Radix) | latest | @/components/ui/* |\n`;
    md += `| Ícones | lucide-react | 0.475 | Apenas lucide |\n`;
    md += `| Roteamento | react-router-dom | 6.x | SPA com BrowserRouter |\n`;
    md += `| Estado global | React Context + useState | — | AuthContext, AppConfigContext |\n`;
    md += `| Data fetching | @tanstack/react-query + SDK | 5.x | queryClientInstance |\n`;
    md += `| Drag & Drop | @hello-pangea/dnd | 17.x | Kanban, reorder widgets |\n`;
    md += `| Rich text | react-quill | 2.x | Notas e briefings |\n`;
    md += `| Gráficos | recharts | 2.x | Lazy loaded |\n`;
    md += `| PDF | jspdf + html2canvas | — | Relatórios e cronogramas |\n`;
    md += `| Datas | date-fns + moment | — | date-fns preferido |\n`;
    md += `| Backend Functions | JavaScript (Deno) | — | npm:@base44/sdk@0.8.40 |\n`;
    md += `| Integrações externas | Z-API (WhatsApp), Google Drive, Instagram Graph | — | Via backend functions |\n`;
    md += `| Animações | framer-motion | 11.x | Page transitions |\n`;
    md += `| Build | Vite | 5.x | HMR, code splitting com lazy imports |\n\n`;

    // ── ENTIDADES ──
    md += `---\n## 🗄️ Entidades (Database Schemas)\n\n`;
    md += `Cada entidade possui campos built-in: \`id\`, \`created_date\`, \`updated_date\`, \`created_by_id\`\n\n`;

    const entitySchemas = {
      Client: { data: clients }, Project: { data: projects }, Job: { data: jobs },
      Collaborator: { data: collaborators }, Subtask: { data: subtasks },
      FeeContract: { data: feeContracts }, JobTemplate: { data: templates },
      AppConfig: { data: appConfigs }, Squad: { data: squads },
      BankAccount: { data: bankAccounts }, CostCenter: { data: costCenters },
    };
    for (const [name, info] of Object.entries(entitySchemas)) {
      md += `### Entity: \`${name}\` (${info.data.length} registros)\n\n`;
      if (info.data.length > 0) {
        const sample = info.data[0];
        const fields = Object.keys(sample).filter(k => !['id', 'created_date', 'updated_date', 'created_by_id'].includes(k));
        md += `**Campos:** ${fields.join(', ')}\n\n`;
        md += `**Amostra (1 registro):**\n\`\`\`json\n${JSON.stringify(sample, null, 2).substring(0, 2000)}\n\`\`\`\n\n`;
      }
    }

    // ── APP CONFIGS ──
    md += `---\n## ⚙️ Configurações do Sistema (AppConfig)\n\n`;
    appConfigs.forEach(cfg => {
      md += `### Key: \`${cfg.key}\`\n\`\`\`json\n${JSON.stringify(cfg.value, null, 2)}\n\`\`\`\n\n`;
    });

    // ── SQUADS ──
    md += `---\n## 👥 Squads/Equipes\n\n`;
    squads.forEach(s => {
      md += `- **${s.name}** ${s.color ? `(${s.color})` : ''} — ${(s.members || []).map(m => m.collaborator_name).join(', ') || 'Sem membros'}\n`;
    });
    md += `\n`;

    // ── JOB TEMPLATES ──
    md += `---\n## 📋 Templates de Jobs\n\n`;
    templates.forEach(t => {
      md += `### ${t.name}\n`;
      if (t.job_title) md += `- Título padrão: ${t.job_title}\n`;
      if (t.teams?.length) md += `- Equipes: ${t.teams.join(', ')}\n`;
      if (t.content_types?.length) md += `- Tipos de conteúdo: ${t.content_types.join(', ')}\n`;
      if (t.subtasks?.length) {
        md += `- Subtarefas (${t.subtasks.length}):\n`;
        t.subtasks.forEach((s, i) => {
          md += `  ${i + 1}. ${s.title} — resp: ${s.responsible_name || s.responsible_role || '—'}, dias antes: ${s.days_before_post ?? '—'}, auto-complete em: ${s.complete_at_status || '—'}\n`;
        });
      }
      md += `\n`;
    });

    // ── PÁGINAS ──
    md += `---\n## 📄 Estrutura de Páginas (Frontend)\n\n`;
    md += `| Rota | Página | Descrição |\n|---|---|---|\n`;
    md += `| /Dashboard | Dashboard | Hub central — KPIs, widgets modulares, drag-and-drop |\n`;
    md += `| /Projects | Projects | Gestão de projetos, cronogramas, calendários |\n`;
    md += `| /Jobs | Jobs | Kanban, lista, tabela, timesheet — gestão de jobs |\n`;
    md += `| /Proposals | Proposals | Propostas comerciais |\n`;
    md += `| /Documentos | Documentos | Geração de contratos e documentos |\n`;
    md += `| /Agenda | Agenda | Calendário de atividades (semana/mês) |\n`;
    md += `| /ClientPortfolio | ClientPortfolio | Carteira de clientes, NPS, tiers |\n`;
    md += `| /Financial | Financial | Lançamentos, contas, DRE, fluxo de caixa |\n`;
    md += `| /Conversations | Conversations | Chat/conversas internas |\n`;
    md += `| /Instagram | Instagram | Métricas de Instagram por cliente |\n`;
    md += `| /Reports | Reports | Relatórios gerenciais diversos |\n`;
    md += `| /Configuracoes | Configuracoes | Sistema, cadastros, templates, etapas, recuperação |\n`;
    md += `| /Recovery | Recovery | Lixeira — registros deletados restauráveis |\n`;
    md += `| /JobApproval | JobApproval | Página pública de aprovação de jobs (sem auth) |\n\n`;

    // ── BACKEND FUNCTIONS ──
    md += `---\n## ⚡ Backend Functions\n\n`;
    md += `| Função | Descrição |\n|---|---|\n`;
    md += `| collaboratorLogin | Autenticação customizada via login+senha |\n`;
    md += `| hashCollaboratorPassword | Hash bcrypt de senhas |\n`;
    md += `| generateSystemReport | Relatório .md com estado atual do sistema |\n`;
    md += `| exportSystemBlueprint | Export completo para rebuild (este doc) |\n`;
    md += `| getDashboardData | Dados agregados para o dashboard |\n`;
    md += `| generateAIInsights | Insights AI sobre clientes |\n`;
    md += `| sendWhatsapp | Envio de mensagens WhatsApp via Z-API |\n`;
    md += `| sendWhatsappFile | Envio de arquivos via Z-API |\n`;
    md += `| listWhatsappGroups | Lista grupos WhatsApp |\n`;
    md += `| checkZapiStatus | Verifica status Z-API |\n`;
    md += `| jobAlertNotifications | Notificações automáticas de jobs |\n`;
    md += `| sendApprovalNotification | Notificação de aprovação |\n`;
    md += `| handleJobApproval | Processar aprovação de job |\n`;
    md += `| uploadToDrive | Upload Google Drive |\n`;
    md += `| fetchInstagramInsights | Coleta métricas Instagram |\n`;
    md += `| syncSquadChanges | Sincronização de squads |\n\n`;

    // ── FLUXOS ──
    md += `---\n## 🔄 Fluxos Críticos\n\n`;
    md += `### Autenticação\n`;
    md += `1. Usuário acessa o app → CollaboratorLoginPanel\n`;
    md += `2. Digita login (username) + senha\n`;
    md += `3. Frontend chama \`collaboratorLogin\` backend function\n`;
    md += `4. Backend verifica hash bcrypt → retorna dados do collaborator\n`;
    md += `5. Dados salvos em sessionStorage("collaborator")\n`;
    md += `6. AuthContext/ProtectedRoute gerenciam acesso por access_level (master/gestor/collaborator)\n`;
    md += `7. InactivityGuard faz logout após inatividade\n\n`;

    md += `### Criação de Job\n`;
    md += `1. Usuário cria via CreateJobModal ou bulk (a partir de template)\n`;
    md += `2. Job vinculado a Project + Client\n`;
    md += `3. Subtasks criadas automaticamente a partir do JobTemplate\n`;
    md += `4. Deadlines calculados com base em post_date - days_before_post\n`;
    md += `5. Status tracking via JobHistory (cada change salva old_value/new_value)\n\n`;

    md += `### Aprovação de Job\n`;
    md += `1. Admin envia link de aprovação (sendApprovalNotification)\n`;
    md += `2. Link aponta para /JobApproval?token=... (página pública)\n`;
    md += `3. Cliente aprova/reprova com comentários\n`;
    md += `4. handleJobApproval atualiza status do job\n\n`;

    // ════════════════════════════════════════════════════════════════
    // PARTE 2: RELATÓRIO OPERACIONAL (ESTADO ATUAL)
    // ════════════════════════════════════════════════════════════════

    md += `\n---\n---\n# 📊 RELATÓRIO OPERACIONAL (Estado Atual)\n\n`;

    const activeClients = clients.filter(c => c.status === 'active');
    const activeProjects = projects.filter(p => p.status === 'in_progress' || p.status === 'no_status');
    const activeJobs = jobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
    const overdueJobs = activeJobs.filter(j => j.post_date && j.post_date < today);
    const activeCollabs = collaborators.filter(c => c.is_active);

    md += `## 🔢 Resumo Geral\n\n`;
    md += `| Indicador | Qtd |\n|---|---|\n`;
    md += `| Clientes ativos | ${activeClients.length} |\n`;
    md += `| Projetos em andamento | ${activeProjects.length} |\n`;
    md += `| Jobs ativos (não concluídos/cancelados) | ${activeJobs.length} |\n`;
    md += `| Jobs atrasados (post_date < hoje) | ${overdueJobs.length} |\n`;
    md += `| Colaboradores ativos | ${activeCollabs.length} |\n`;
    md += `| Contratos de fee ativos | ${feeContracts.filter(f => f.status === 'active').length} |\n\n`;

    // ── COLABORADORES ──
    md += `## 👤 Colaboradores Completo\n\n`;
    collaborators.forEach(c => {
      md += `### ${c.name}\n`;
      md += `- Email: ${c.email || '—'} | Login: ${c.login || '—'} | Acesso: ${c.access_level || 'collaborator'}\n`;
      md += `- Cargo: ${c.role || '—'} | Depto: ${c.department || '—'} | Ativo: ${c.is_active !== false ? 'Sim' : 'Não'}\n`;
      if (c.hourly_rate) md += `- Hora: R$ ${c.hourly_rate}`;
      if (c.monthly_salary) md += ` | Salário: R$ ${c.monthly_salary}`;
      if (c.hourly_rate || c.monthly_salary) md += `\n`;
      md += `\n`;
    });

    // ── CLIENTES COM PROJETOS E JOBS ──
    md += `---\n## 🏢 Clientes Ativos — Detalhe Completo\n\n`;
    activeClients.forEach(client => {
      const cJobs = jobsByClient[client.id] || [];
      const cActiveJobs = cJobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
      const cOverdue = cActiveJobs.filter(j => j.post_date && j.post_date < today);
      const contracts = contractsByClient[client.id] || [];
      const activeContract = contracts.find(fc => fc.status === 'active');

      md += `### ${client.name}${client.tier ? ` (${client.tier.toUpperCase()})` : ''}\n\n`;
      if (client.responsible) md += `- **Responsável comercial:** ${client.responsible}\n`;
      if (client.email) md += `- **Email:** ${client.email}\n`;
      if (client.phone) md += `- **Telefone:** ${client.phone}\n`;
      if (client.services?.length) md += `- **Serviços:** ${client.services.join(', ')}\n`;
      if (activeContract) md += `- **Fee mensal:** R$ ${activeContract.monthly_value?.toLocaleString('pt-BR')}\n`;

      const deliveries = [];
      if (client.contracted_cards) deliveries.push(`${client.contracted_cards} Cards`);
      if (client.contracted_reels) deliveries.push(`${client.contracted_reels} Reels`);
      if (client.contracted_stories) deliveries.push(`${client.contracted_stories} Stories`);
      if (client.contracted_vt) deliveries.push(`${client.contracted_vt} VT`);
      if (client.contracted_foto) deliveries.push(`${client.contracted_foto} Fotos`);
      if (client.contracted_promocoes) deliveries.push(`${client.contracted_promocoes} Promoções`);
      if (deliveries.length) md += `- **Entregas contratadas:** ${deliveries.join(' · ')}\n`;
      if (client.nps_score !== undefined) md += `- **NPS:** ${client.nps_score}\n`;
      if (client.instagram_username) md += `- **Instagram:** ${client.instagram_username}\n`;
      md += `- **Jobs ativos:** ${cActiveJobs.length} | **Atrasados:** ${cOverdue.length}\n\n`;

      // Projetos do cliente
      const cProjects = projects.filter(p => p.client_id === client.id && (p.status === 'in_progress' || p.status === 'no_status'));
      cProjects.forEach(proj => {
        const pJobs = jobsByProject[proj.id] || [];
        const pActive = pJobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
        const pCompleted = pJobs.filter(j => j.status === 'completed');

        md += `#### 📁 ${proj.name}\n`;
        if (proj.responsible_name) md += `- Responsável: ${proj.responsible_name}\n`;
        if (proj.teams?.length) md += `- Equipes: ${proj.teams.join(', ')}\n`;
        md += `- Jobs: ${pActive.length} ativos, ${pCompleted.length} concluídos de ${pJobs.length} total\n`;

        if (pActive.length > 0) {
          md += `\n| Job | Tipo | Status | Post Date | Responsável | Subtarefas |\n|---|---|---|---|---|---|\n`;
          pActive.sort((a, b) => (a.post_date || '9999').localeCompare(b.post_date || '9999'));
          pActive.forEach(j => {
            const subs = subtasksByJob[j.id] || [];
            const subsDone = subs.filter(s => s.is_completed).length;
            const subsOverdue = subs.filter(s => !s.is_completed && s.deadline && s.deadline < today).length;
            const subsInfo = subs.length > 0 ? `${subsDone}/${subs.length}${subsOverdue > 0 ? ` (⚠️${subsOverdue} atrasadas)` : ''}` : '—';
            const isOverdue = j.post_date && j.post_date < today ? ' ⚠️' : '';
            md += `| ${j.title || j.number || '—'} | ${contentLabels[j.content_type] || j.content_type || '—'} | ${statusLabels[j.status] || j.status} | ${j.post_date || '—'}${isOverdue} | ${j.responsible_name || '—'} | ${subsInfo} |\n`;
          });
          md += `\n`;
        }
      });
      md += `---\n\n`;
    });

    // ── JOBS ATRASADOS ──
    if (overdueJobs.length > 0) {
      md += `## ⚠️ Jobs Atrasados (post_date anterior a hoje)\n\n`;
      md += `| Cliente | Projeto | Job | Tipo | Status | Post Date | Responsável |\n|---|---|---|---|---|---|---|\n`;
      overdueJobs.sort((a, b) => (a.post_date || '').localeCompare(b.post_date || ''));
      overdueJobs.forEach(j => {
        md += `| ${j.client_name || '—'} | ${j.project_name || '—'} | ${j.title || '—'} | ${contentLabels[j.content_type] || '—'} | ${statusLabels[j.status] || j.status} | ${j.post_date} | ${j.responsible_name || '—'} |\n`;
      });
      md += `\n`;
    }

    // ── SUBTAREFAS ATRASADAS ──
    const overdueSubs = subtasks.filter(s => !s.is_completed && s.deadline && s.deadline < today);
    if (overdueSubs.length > 0) {
      md += `## ⏰ Subtarefas Atrasadas (${overdueSubs.length})\n\n`;
      md += `| Subtarefa | Deadline | Responsável | Job |\n|---|---|---|---|\n`;
      overdueSubs.sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
      overdueSubs.slice(0, 200).forEach(s => {
        const j = jobs.find(job => job.id === s.job_id);
        md += `| ${s.title} | ${s.deadline} | ${s.responsible_name || '—'} | ${j?.title || s.job_id} |\n`;
      });
      if (overdueSubs.length > 200) md += `\n_...e mais ${overdueSubs.length - 200} subtarefas atrasadas._\n`;
      md += `\n`;
    }

    // ── CARGA POR COLABORADOR ──
    md += `## 📋 Carga por Colaborador (Jobs ativos)\n\n`;
    md += `| Colaborador | Jobs ativos | Subtarefas pendentes |\n|---|---|---|\n`;
    activeCollabs.forEach(c => {
      const myJobs = activeJobs.filter(j => j.responsible_id === c.id);
      const mySubs = subtasks.filter(s => !s.is_completed && s.responsible_id === c.id);
      if (myJobs.length > 0 || mySubs.length > 0) {
        md += `| ${c.name} | ${myJobs.length} | ${mySubs.length} |\n`;
      }
    });
    md += `\n`;

    // ════════════════════════════════════════════════════════════════
    // PARTE 3: HISTÓRICO DOS ÚLTIMOS 90 DIAS
    // ════════════════════════════════════════════════════════════════

    md += `\n---\n---\n# 📜 HISTÓRICO DOS ÚLTIMOS 90 DIAS\n\n`;

    // ── JOB HISTORY (últimos 90d) ──
    md += `## 🔄 Alterações em Jobs (últimos 90 dias: ${jobHistory.length} registros)\n\n`;
    if (jobHistory.length > 0) {
      md += `| Data | Job | Tipo | Descrição | Usuário | Campo | De → Para |\n|---|---|---|---|---|---|---|\n`;
      jobHistory.slice(0, 500).forEach(h => {
        const date = h.created_date ? new Date(h.created_date).toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' }) : '—';
        const job = jobs.find(j => j.id === h.job_id);
        const jobLabel = job?.title || job?.number || h.job_id?.substring(0, 8) || '—';
        const change = h.field ? `${h.old_value || '—'} → ${h.new_value || '—'}` : '—';
        md += `| ${date} | ${jobLabel} | ${h.type} | ${(h.text || '').substring(0, 60)} | ${h.user || '—'} | ${h.field || '—'} | ${change} |\n`;
      });
      if (jobHistory.length > 500) md += `\n_...e mais ${jobHistory.length - 500} registros._\n`;
      md += `\n`;
    }

    // ── TIMESHEETS (últimos 90d) ──
    md += `## ⏱️ Timesheets (últimos 90 dias: ${timesheets.length} sessões)\n\n`;
    if (timesheets.length > 0) {
      // Resumo por colaborador
      const tsByCollab = {};
      timesheets.forEach(t => {
        const name = t.collaborator_name || 'Desconhecido';
        if (!tsByCollab[name]) tsByCollab[name] = { total: 0, sessions: 0 };
        tsByCollab[name].total += t.duration_minutes || 0;
        tsByCollab[name].sessions++;
      });
      md += `### Resumo por Colaborador\n\n`;
      md += `| Colaborador | Sessões | Horas Totais |\n|---|---|---|\n`;
      Object.entries(tsByCollab).sort((a, b) => b[1].total - a[1].total).forEach(([name, data]) => {
        md += `| ${name} | ${data.sessions} | ${(data.total / 60).toFixed(1)}h |\n`;
      });
      md += `\n`;

      // Detalhes (últimas 200)
      md += `### Últimas sessões\n\n`;
      md += `| Data | Colaborador | Job | Cliente | Duração | Retrabalho |\n|---|---|---|---|---|---|\n`;
      timesheets.slice(0, 200).forEach(t => {
        const date = t.started_at ? new Date(t.started_at).toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' }) : '—';
        md += `| ${date} | ${t.collaborator_name || '—'} | ${t.job_title || '—'} | ${t.client_name || '—'} | ${t.duration_minutes || 0}min | ${t.is_rework ? '⚠️ Sim' : 'Não'} |\n`;
      });
      if (timesheets.length > 200) md += `\n_...e mais ${timesheets.length - 200} sessões._\n`;
      md += `\n`;
    }

    // ── FINANCEIRO ──
    md += `## 💰 Lançamentos Financeiros\n\n`;
    if (financialEntries.length > 0) {
      const revenues = financialEntries.filter(e => e.type === 'revenue');
      const expenses = financialEntries.filter(e => e.type === 'expense');
      const totalRev = revenues.reduce((s, e) => s + (e.amount || 0), 0);
      const totalExp = expenses.reduce((s, e) => s + (e.amount || 0), 0);

      md += `- **Total receitas:** R$ ${totalRev.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
      md += `- **Total despesas:** R$ ${totalExp.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
      md += `- **Resultado:** R$ ${(totalRev - totalExp).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
      md += `- **Total lançamentos:** ${financialEntries.length}\n\n`;

      md += `### Últimos lançamentos\n\n`;
      md += `| Tipo | Título | Valor | Vencimento | Status | Cliente | Categoria |\n|---|---|---|---|---|---|---|\n`;
      financialEntries.slice(0, 300).forEach(e => {
        md += `| ${e.type === 'revenue' ? '📈 Receita' : '📉 Despesa'} | ${e.title || '—'} | R$ ${(e.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | ${e.due_date || '—'} | ${e.status || '—'} | ${e.client_name || '—'} | ${e.category || '—'} |\n`;
      });
      if (financialEntries.length > 300) md += `\n_...e mais ${financialEntries.length - 300} lançamentos._\n`;
      md += `\n`;
    }

    // ── ANEXOS DE JOBS (últimos 90d) ──
    md += `## 📎 Anexos de Jobs (últimos 90 dias)\n\n`;
    const recentJobs = jobs.filter(j => j.created_date && j.created_date >= d90);
    const jobsWithAttachments = recentJobs.filter(j => j.attachments?.length > 0);
    if (jobsWithAttachments.length > 0) {
      md += `| Job | Cliente | Arquivo | Tipo | URL |\n|---|---|---|---|---|\n`;
      jobsWithAttachments.forEach(j => {
        (j.attachments || []).forEach(att => {
          md += `| ${j.title || j.number || '—'} | ${j.client_name || '—'} | ${att.name || '—'} | ${att.type || '—'} | ${att.url || '—'} |\n`;
        });
      });
      md += `\n`;
    } else {
      md += `_Nenhum anexo encontrado nos últimos 90 dias._\n\n`;
    }

    // ── DELETE LOGS ──
    md += `## 🗑️ Exclusões (últimos 90 dias: ${deleteLogs.length})\n\n`;
    if (deleteLogs.length > 0) {
      md += `| Data | Tipo | Quem | Entidade | Motivo |\n|---|---|---|---|---|\n`;
      deleteLogs.slice(0, 100).forEach(d => {
        const date = d.deleted_at ? new Date(d.deleted_at).toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' }) : '—';
        const entityLabel = d.entity_data?.title || d.entity_data?.name || d.entity_id?.substring(0, 8) || '—';
        md += `| ${date} | ${d.entity_type} | ${d.deleted_by_name || '—'} | ${entityLabel} | ${d.reason || '—'} |\n`;
      });
      md += `\n`;
    }

    // ── REBUILD ADVICE ──
    md += `---\n## 💡 Aconselhamento para Rebuild\n\n`;
    md += `### Ordem recomendada:\n`;
    md += `1. Infraestrutura Base (Vite + React + Tailwind + design tokens)\n`;
    md += `2. Entidades (schemas JSON + RLS)\n`;
    md += `3. Backend Functions (auth, dashboard, integrações)\n`;
    md += `4. Auth & Routing (AuthContext, ProtectedRoute, InactivityGuard)\n`;
    md += `5. Layout & Navigation (header, bottom nav, dark mode)\n`;
    md += `6. Páginas Core (Dashboard, Jobs, Projects, Financial)\n`;
    md += `7. Features Secundárias (Proposals, Agenda, Reports, Instagram, WhatsApp)\n\n`;

    md += `### Padrões:\n`;
    md += `- Componentes < 50 linhas, @/ alias, sessionStorage para sessão\n`;
    md += `- CSS variables + .dark class, Mobile-first, touch targets ≥ 44px\n`;
    md += `- Lazy loading com lazyWithRetry, timezone America/Manaus\n`;
    md += `- Nível de acesso: master (tudo), gestor (admin sem financeiro/exclusões), collaborator (limitado)\n\n`;

    md += `---\n_Fim do Blueprint Completo. Este documento permite reconstrução 100% fiel do sistema._\n`;

    return Response.json({ markdown: md, filename: `dominio-maestro-blueprint-${today}.md` });
  } catch (error) {
    console.error('[ERROR]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}