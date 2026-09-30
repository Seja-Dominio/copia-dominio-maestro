import pg from "pg";
import { getIsolatedTestDatabaseSsl, getIsolatedTestDatabaseUrl } from "./lib/isolated-test-database.mjs";

let databaseUrl;
try {
  databaseUrl = getIsolatedTestDatabaseUrl();
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: getIsolatedTestDatabaseSsl(databaseUrl) });
const failures = [];
const assertions = [];
const organizationId = crypto.randomUUID();
const secondOrganizationId = crypto.randomUUID();
const collaboratorId = crypto.randomUUID();
const ids = {
  client: `isolation-client-${organizationId}`,
  project: `isolation-project-${organizationId}`,
  job: `isolation-job-${organizationId}`,
  secondClient: `isolation-client-${secondOrganizationId}`,
  secondProject: `isolation-project-${secondOrganizationId}`,
  secondJob: `isolation-job-${secondOrganizationId}`,
  secondSubtask: `isolation-subtask-${secondOrganizationId}`,
};
let savepointSequence = 0;
let phase = "connect";

async function expectForeignKeyViolation(name, sql, params) {
  const savepoint = `tenant_fk_check_${++savepointSequence}`;
  await client.query(`savepoint ${savepoint}`);
  let rejected = false;
  try {
    await client.query(sql, params);
  } catch (error) {
    rejected = error?.code === "23503";
  }
  await client.query(`rollback to savepoint ${savepoint}`);
  await client.query(`release savepoint ${savepoint}`);
  if (!rejected) failures.push(`${name}:cross_tenant_reference_not_rejected`);
}

try {
  await client.connect();
  await client.query("begin");
  await client.query(
    `insert into public.maestro_collaborators (id, login, password_hash, is_active, profile)
     values ($1, $2, 'test-only', true, '{}'::jsonb)`,
    [collaboratorId, `isolation-${collaboratorId}@invalid.test`],
  );
  await client.query(
    `insert into public.organizations (id, name, slug, status, created_by)
     values ($1, 'Isolation Test A', $2, 'active', $4),
            ($3, 'Isolation Test B', $5, 'active', $4)`,
    [organizationId, `isolation-a-${organizationId.slice(0, 8)}`, secondOrganizationId,
      collaboratorId, `isolation-b-${secondOrganizationId.slice(0, 8)}`],
  );
  await client.query(
    `insert into public.organization_members (organization_id, collaborator_id, role, status)
     values ($1, $2, 'owner', 'active')`,
    [organizationId, collaboratorId],
  );
  await client.query(
    `insert into public.organization_products (organization_id, product_key, status, plan_key)
     values ($1, 'maestro', 'enabled', 'isolation-test')`,
    [organizationId],
  );

  phase = "verify integration-based legacy tenant routing";
  const gucRecordId = `isolation-scope-guc-${organizationId}`;
  await client.query("select set_config($1, $2, true)", ["maestro.organization_id", organizationId]);
  await client.query(
    `insert into public.legacy_records (entity, record_id, payload)
     values ('IsolationScopeGuc', $1, '{}'::jsonb)`,
    [gucRecordId],
  );
  const gucScopedRecord = await client.query(
    `select organization_id from public.legacy_records where entity='IsolationScopeGuc' and record_id=$1`,
    [gucRecordId],
  );
  if (gucScopedRecord.rows[0]?.organization_id !== organizationId) {
    failures.push("legacy_scope:configured_organization_not_applied");
  }
  await client.query("select set_config($1, '', true)", ["maestro.organization_id"]);

  const relatedClientId = `isolation-routing-client-${secondOrganizationId}`;
  const relatedRecordId = `isolation-related-record-${secondOrganizationId}`;
  await client.query(
    `insert into public.organization_legacy_records (
       organization_id, legacy_entity, legacy_record_id, scope_status, source
     ) values ($1, 'Client', $2, 'confirmed', 'isolation-test')`,
    [secondOrganizationId, relatedClientId],
  );
  await client.query(
    `insert into public.legacy_records (entity, record_id, payload)
     values ('ClientInsight', $1, $2::jsonb)`,
    [relatedRecordId, JSON.stringify({ client_id: relatedClientId })],
  );
  const relatedScopedRecord = await client.query(
    `select organization_id from public.legacy_records where entity='ClientInsight' and record_id=$1`,
    [relatedRecordId],
  );
  if (relatedScopedRecord.rows[0]?.organization_id !== secondOrganizationId) {
    failures.push("legacy_scope:related_client_organization_not_applied");
  }

  const integrationKey = `isolation-${secondOrganizationId}`;
  const webhookReceiptId = `isolation-webhook-${secondOrganizationId}`;
  await client.query(
    `insert into public.organization_integrations (organization_id, provider, external_key)
     values ($1, 'whatsapp', $2)`,
    [secondOrganizationId, integrationKey],
  );
  await client.query(
    `insert into public.legacy_records (entity, record_id, payload)
     values ('DominusWebhookReceipt', $1, $2::jsonb)`,
    [webhookReceiptId, JSON.stringify({ instance: integrationKey })],
  );
  const scopedWebhookReceipt = await client.query(
    `select organization_id from public.legacy_records
     where entity='DominusWebhookReceipt' and record_id=$1`,
    [webhookReceiptId],
  );
  if (scopedWebhookReceipt.rows[0]?.organization_id !== secondOrganizationId) {
    failures.push("legacy_webhook:integration_tenant_scope_not_applied");
  }
  const unmappedWebhookId = `isolation-webhook-unmapped-${secondOrganizationId}`;
  await client.query(
    `insert into public.legacy_records (entity, record_id, payload)
     values ('DominusWebhookReceipt', $1, $2::jsonb)`,
    [unmappedWebhookId, JSON.stringify({ instance: `unmapped-${integrationKey}` })],
  );
  const unmappedWebhook = await client.query(
    `select organization_id from public.legacy_records
     where entity='DominusWebhookReceipt' and record_id=$1`,
    [unmappedWebhookId],
  );
  if (unmappedWebhook.rows[0]?.organization_id !== null) {
    failures.push("legacy_webhook:unmapped_instance_was_assigned_to_a_tenant");
  }

  const rows = [
    ["Client", ids.client, { id: ids.client, name: "Isolation Client" }],
    ["Project", ids.project, { id: ids.project, name: "Isolation Project", client_id: ids.client }],
    ["Job", ids.job, { id: ids.job, title: "Isolation Job", project_id: ids.project, client_id: ids.client }],
  ];
  phase = "seed explicit organization-owned legacy rows";
  for (const [entity, recordId, payload] of rows) {
    await client.query(
      `insert into public.legacy_records (organization_id, entity, record_id, payload)
       values ($1, $2, $3, $4)`,
    [organizationId, entity, recordId, payload],
    );
  }
  const secondTenantRows = [
    ["Client", ids.secondClient, { id: ids.secondClient, name: "Other Tenant Client" }],
    ["Project", ids.secondProject, { id: ids.secondProject, name: "Other Tenant Project", client_id: ids.secondClient }],
    ["Job", ids.secondJob, { id: ids.secondJob, title: "Other Tenant Job", project_id: ids.secondProject, client_id: ids.secondClient }],
  ];
  for (const [entity, recordId, payload] of secondTenantRows) {
    await client.query(
      `insert into public.legacy_records (organization_id, entity, record_id, payload)
       values ($1, $2, $3, $4)`,
      [secondOrganizationId, entity, recordId, payload],
    );
  }
  await client.query(
    `insert into public.legacy_records (organization_id, entity, record_id, payload)
     values ($1, 'Subtask', $2, $3::jsonb)`,
    [secondOrganizationId, ids.secondSubtask, JSON.stringify({
      id: ids.secondSubtask, title: "Other tenant task", job_id: ids.secondJob, status: "To Do",
    })],
  );

  // A service-role upsert may hit the global (entity, record_id) conflict key;
  // the database must still prevent it from moving a legacy row to another tenant.
  await client.query("savepoint legacy_tenant_reassignment_check");
  let legacyTenantReassignmentDenied = false;
  try {
    await client.query(
      `update public.legacy_records set organization_id=$1
       where organization_id=$2 and entity='Client' and record_id=$3`,
      [secondOrganizationId, organizationId, ids.client],
    );
  } catch (error) {
    legacyTenantReassignmentDenied = error?.code === "23514";
    await client.query("rollback to savepoint legacy_tenant_reassignment_check");
  }
  await client.query("release savepoint legacy_tenant_reassignment_check");
  if (!legacyTenantReassignmentDenied) failures.push("legacy_records:cross_tenant_reassignment_not_denied");

  phase = "verify tenant-scoped schedule RPC";
  await client.query("savepoint project_schedule_scope_check");
  let crossTenantSchedulePatchDenied = false;
  try {
    await client.query(
      `select public.maestro_patch_project_schedule_scoped($1,$2,$3::jsonb,$4,$5)`,
      [secondOrganizationId, ids.project, JSON.stringify({ "2099-01-01": [{ id: "cross-tenant" }] }), collaboratorId, "Fixture"],
    );
  } catch (error) {
    crossTenantSchedulePatchDenied = error?.code === "42501";
    await client.query("rollback to savepoint project_schedule_scope_check");
  }
  await client.query("release savepoint project_schedule_scope_check");
  if (!crossTenantSchedulePatchDenied) failures.push("project_schedule:cross_tenant_patch_not_denied");
  const sameTenantSchedulePatch = await client.query(
    `select public.maestro_patch_project_schedule_scoped($1,$2,$3::jsonb,$4,$5) as data`,
    [organizationId, ids.project, JSON.stringify({ "2099-01-02": [{ id: "same-tenant" }] }), collaboratorId, "Fixture"],
  );
  if (!sameTenantSchedulePatch.rows[0]?.data?.schedule_data?.["2099-01-02"]) {
    failures.push("project_schedule:same_tenant_patch_failed");
  }

  // Read the relational projections produced by the explicit-tenant dual-write
  // trigger; do not seed duplicates that would bypass the path under test.
  const relationalIds = {};
  phase = "verify explicit-tenant relational dual-write";
  for (const [tenantId, prefix, clientLegacyId, projectLegacyId, jobLegacyId] of [
    [organizationId, "tenant-a", ids.client, ids.project, ids.job],
    [secondOrganizationId, "tenant-b", ids.secondClient, ids.secondProject, ids.secondJob],
  ]) {
    const seededClient = await client.query(
      `select id from public.maestro_clients where organization_id=$1 and legacy_record_id=$2`,
      [tenantId, clientLegacyId],
    );
    const seededProject = await client.query(
      `select id, client_id, client_legacy_record_id from public.maestro_projects where organization_id=$1 and legacy_record_id=$2`,
      [tenantId, projectLegacyId],
    );
    const seededJob = await client.query(
      `select id, project_id, project_legacy_record_id, client_id, client_legacy_record_id
       from public.maestro_jobs where organization_id=$1 and legacy_record_id=$2`,
      [tenantId, jobLegacyId],
    );
    if (!seededClient.rows[0] || !seededProject.rows[0] || !seededJob.rows[0]) {
      failures.push(`dual_write:${prefix}_relational_projection_missing`);
      continue;
    }
    if (seededProject.rows[0].client_id !== seededClient.rows[0].id
      || seededJob.rows[0].project_id !== seededProject.rows[0].id
      || seededJob.rows[0].client_id !== seededClient.rows[0].id
      || seededProject.rows[0].client_legacy_record_id !== clientLegacyId
      || seededJob.rows[0].project_legacy_record_id !== projectLegacyId
      || seededJob.rows[0].client_legacy_record_id !== clientLegacyId) {
      failures.push(`dual_write:${prefix}_relational_relationship_mismatch`);
    }
    relationalIds[prefix] = {
      client: seededClient.rows[0].id,
      project: seededProject.rows[0].id,
      job: seededJob.rows[0].id,
    };
  }

  phase = "verify typed timesheet client and project dual-write";
  for (const [tenantId, prefix, timesheetId, clientLegacyId, projectLegacyId, jobLegacyId] of [
    [organizationId, "tenant-a", `isolation-timesheet-${organizationId}`, ids.client, ids.project, ids.job],
    [secondOrganizationId, "tenant-b", `isolation-timesheet-${secondOrganizationId}`, ids.secondClient, ids.secondProject, ids.secondJob],
  ]) {
    await client.query(
      `insert into public.legacy_records (organization_id, entity, record_id, payload)
       values ($1, 'Timesheet', $2, $3::jsonb)`,
      [tenantId, timesheetId, JSON.stringify({ id: timesheetId, client_id: clientLegacyId, project_id: projectLegacyId, job_id: jobLegacyId, duration_minutes: "25" })],
    );
    const timesheet = await client.query(
      `select t.client_id, t.project_id, t.client_legacy_record_id, t.project_legacy_record_id,
        c.id as expected_client_id, p.id as expected_project_id
       from public.maestro_timesheets t
       left join public.maestro_clients c on c.organization_id=t.organization_id and c.legacy_record_id=$2
       left join public.maestro_projects p on p.organization_id=t.organization_id and p.legacy_record_id=$3
       where t.organization_id=$1 and t.legacy_record_id=$4`,
      [tenantId, clientLegacyId, projectLegacyId, timesheetId],
    );
    const row = timesheet.rows[0];
    if (!row || row.client_id !== row.expected_client_id || row.project_id !== row.expected_project_id
      || row.client_legacy_record_id !== clientLegacyId || row.project_legacy_record_id !== projectLegacyId) {
      failures.push(`timesheet:${prefix}_client_project_typed_dual_write_mismatch`);
    }
    relationalIds[prefix].timesheet = timesheetId;
  }

  const orphanTimesheetId = `isolation-timesheet-snapshot-${organizationId}`;
  const orphanClientId = `deleted-client-snapshot-${organizationId}`;
  const orphanProjectId = `deleted-project-snapshot-${organizationId}`;
  await client.query(
    `insert into public.legacy_records (organization_id, entity, record_id, payload)
     values ($1, 'Timesheet', $2, $3::jsonb)`,
    [organizationId, orphanTimesheetId, JSON.stringify({
      id: orphanTimesheetId, job_id: ids.job, client_id: orphanClientId,
      project_id: orphanProjectId, duration_minutes: "10",
    })],
  );
  const orphanSnapshot = await client.query(
    `select client_id, project_id, client_legacy_record_id, project_legacy_record_id
     from public.maestro_timesheets where organization_id=$1 and legacy_record_id=$2`,
    [organizationId, orphanTimesheetId],
  );
  if (orphanSnapshot.rows[0]?.client_id !== null || orphanSnapshot.rows[0]?.project_id !== null
    || orphanSnapshot.rows[0]?.client_legacy_record_id !== orphanClientId
    || orphanSnapshot.rows[0]?.project_legacy_record_id !== orphanProjectId) {
    failures.push("timesheet:unresolved_parent_snapshot_not_preserved");
  } else assertions.push("timesheet_same_tenant_client_project_dual_write");

  await client.query(
    `update public.legacy_records set payload=payload || '{"duration_minutes":"11"}'::jsonb
     where organization_id=$1 and entity='Timesheet' and record_id=$2`,
    [organizationId, orphanTimesheetId],
  );
  const updatedOrphanSnapshot = await client.query(
    `select client_id, project_id, client_legacy_record_id, project_legacy_record_id, duration_minutes
     from public.maestro_timesheets where organization_id=$1 and legacy_record_id=$2`,
    [organizationId, orphanTimesheetId],
  );
  if (updatedOrphanSnapshot.rows[0]?.client_id !== null || updatedOrphanSnapshot.rows[0]?.project_id !== null
    || updatedOrphanSnapshot.rows[0]?.client_legacy_record_id !== orphanClientId
    || updatedOrphanSnapshot.rows[0]?.project_legacy_record_id !== orphanProjectId
    || Number(updatedOrphanSnapshot.rows[0]?.duration_minutes) !== 11) {
    failures.push("timesheet:unresolved_historical_snapshot_update_blocked_or_changed");
  } else assertions.push("timesheet_unresolved_snapshots_preserved_and_updateable");

  phase = "verify explicit-tenant subtask dual-write";
  const subtaskProjection = await client.query(
    `select t.organization_id, t.job_id, t.resolution_status, j.id as expected_job_id
     from public.maestro_job_tasks t
     left join public.maestro_jobs j
       on j.organization_id = $1 and j.legacy_record_id = $2
     where t.legacy_record_id = $3`,
    [secondOrganizationId, ids.secondJob, ids.secondSubtask],
  );
  if (subtaskProjection.rows.length !== 1
    || subtaskProjection.rows[0].organization_id !== secondOrganizationId
    || subtaskProjection.rows[0].job_id !== subtaskProjection.rows[0].expected_job_id
    || subtaskProjection.rows[0].resolution_status !== "linked") {
    failures.push("dual_write:explicit_tenant_subtask_missing_or_mis_scoped");
  }

  // Grant only inside this rollback-only test transaction so the RLS policy
  // can be exercised without enabling direct Data API access in the product.
  await client.query("grant select on public.maestro_clients to authenticated");

  phase = "verify authenticated RLS isolation";
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [collaboratorId]);
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: collaboratorId, role: "authenticated" })]);

  const visibleMembership = await client.query(
    "select count(*)::int as count from public.organization_members where organization_id=$1 and collaborator_id=$2",
    [organizationId, collaboratorId],
  );
  if (Number(visibleMembership.rows[0].count) !== 1) failures.push("rls:member_cannot_read_own_membership");
  const hiddenMembership = await client.query(
    "select count(*)::int as count from public.organization_members where organization_id=$1",
    [secondOrganizationId],
  );
  if (Number(hiddenMembership.rows[0].count) !== 0) failures.push("rls:cross_tenant_membership_read_allowed");

  const ownTenant = await client.query(
    "select count(*)::int as count from public.maestro_clients where organization_id=$1 and legacy_record_id=$2",
    [organizationId, ids.client],
  );
  if (Number(ownTenant.rows[0].count) !== 1) failures.push("rls:member_cannot_read_own_tenant");
  const otherTenant = await client.query(
    "select count(*)::int as count from public.maestro_clients where organization_id=$1 and legacy_record_id=$2",
    [secondOrganizationId, ids.secondClient],
  );
  if (Number(otherTenant.rows[0].count) !== 0) failures.push("rls:cross_tenant_read_allowed");

  // Verify direct legacy reads and writes are denied, separately from relational RLS.
  phase = "verify direct legacy table access is denied";
  for (const [operation, sql, params = []] of [
    ["select", "select record_id from public.legacy_records limit 1"],
    ["insert", `insert into public.legacy_records (organization_id, entity, record_id, payload)
      values ($1, 'Client', $2, '{}'::jsonb)`, [organizationId, `isolation-denied-write-${organizationId}`]],
    ["update", "update public.legacy_records set payload='{}'::jsonb where false"],
    ["delete", "delete from public.legacy_records where false"],
  ]) {
    const savepoint = `legacy_${operation}_check`;
    await client.query(`savepoint ${savepoint}`);
    let denied = false;
    try {
      await client.query(sql, params);
    } catch (error) {
      denied = error?.code === "42501";
      await client.query(`rollback to savepoint ${savepoint}`);
    }
    await client.query(`release savepoint ${savepoint}`);
    if (!denied) failures.push(`legacy_records:authenticated_${operation}_not_denied`);
  }

  // Deleting a parent must null only the relation, preserving tenant scope.
  phase = "verify parent delete behavior";
  await client.query("reset role");
  await client.query("savepoint tenant_delete_action_check");
  await client.query("delete from public.maestro_projects where id=$1", [relationalIds["tenant-a"].project]);
  const jobAfterProjectDelete = await client.query(
    "select organization_id, project_id, project_legacy_record_id from public.maestro_jobs where id=$1",
    [relationalIds["tenant-a"].job],
  );
  if (jobAfterProjectDelete.rows[0]?.organization_id !== organizationId || jobAfterProjectDelete.rows[0]?.project_id !== null) {
    failures.push("integrity:project_delete_did_not_null_only_project_fk");
  }
  if (jobAfterProjectDelete.rows[0]?.project_legacy_record_id !== ids.project) {
    failures.push("integrity:project_delete_did_not_preserve_legacy_project_reference");
  }
  const timesheetAfterProjectDelete = await client.query(
    "select project_id, project_legacy_record_id from public.maestro_timesheets where legacy_record_id=$1",
    [relationalIds["tenant-a"].timesheet],
  );
  if (timesheetAfterProjectDelete.rows[0]?.project_id !== null
    || timesheetAfterProjectDelete.rows[0]?.project_legacy_record_id !== ids.project) {
    failures.push("integrity:project_delete_did_not_preserve_timesheet_snapshot");
  }

  await client.query("rollback to savepoint tenant_delete_action_check");
  await client.query("release savepoint tenant_delete_action_check");

  await client.query("savepoint tenant_client_delete_action_check");
  await client.query("delete from public.maestro_clients where id=$1", [relationalIds["tenant-a"].client]);
  const projectAfterClientDelete = await client.query(
    "select organization_id, client_id, client_legacy_record_id from public.maestro_projects where id=$1",
    [relationalIds["tenant-a"].project],
  );
  const jobAfterClientDelete = await client.query(
    "select organization_id, client_id, client_legacy_record_id from public.maestro_jobs where id=$1",
    [relationalIds["tenant-a"].job],
  );
  if (projectAfterClientDelete.rows[0]?.organization_id !== organizationId || projectAfterClientDelete.rows[0]?.client_id !== null
    || jobAfterClientDelete.rows[0]?.organization_id !== organizationId || jobAfterClientDelete.rows[0]?.client_id !== null) {
    failures.push("integrity:client_delete_did_not_null_only_client_fk");
  }
  if (projectAfterClientDelete.rows[0]?.client_legacy_record_id !== ids.client
    || jobAfterClientDelete.rows[0]?.client_legacy_record_id !== ids.client) {
    failures.push("integrity:client_delete_did_not_preserve_legacy_client_references");
  }
  const timesheetAfterClientDelete = await client.query(
    "select client_id, client_legacy_record_id from public.maestro_timesheets where legacy_record_id=$1",
    [relationalIds["tenant-a"].timesheet],
  );
  if (timesheetAfterClientDelete.rows[0]?.client_id !== null
    || timesheetAfterClientDelete.rows[0]?.client_legacy_record_id !== ids.client) {
    failures.push("integrity:client_delete_did_not_preserve_timesheet_snapshot");
  }
  await client.query("rollback to savepoint tenant_client_delete_action_check");
  await client.query("release savepoint tenant_client_delete_action_check");

  // Foreign keys must bind parent and child through organization_id as well as id.
  phase = "verify cross-tenant foreign keys";
  await client.query("reset role");
  const crossTenantProject = await client.query(
    "select id from public.maestro_projects where organization_id=$1 and legacy_record_id=$2",
    [secondOrganizationId, ids.secondProject],
  );
  const projectA = await client.query(
    "select id from public.maestro_projects where organization_id=$1 and legacy_record_id=$2",
    [organizationId, ids.project],
  );
  const crossTenantClient = await client.query(
    "select id from public.maestro_clients where organization_id=$1 and legacy_record_id=$2",
    [secondOrganizationId, ids.secondClient],
  );
  const ownClient = await client.query(
    "select id from public.maestro_clients where organization_id=$1 and legacy_record_id=$2",
    [organizationId, ids.client],
  );
  const ownJob = await client.query(
    "select id from public.maestro_jobs where organization_id=$1 and legacy_record_id=$2",
    [organizationId, ids.job],
  );
  const otherJob = await client.query(
    "select id from public.maestro_jobs where organization_id=$1 and legacy_record_id=$2",
    [secondOrganizationId, ids.secondJob],
  );
  if (projectA.rows[0] && crossTenantProject.rows[0] && crossTenantClient.rows[0] && ownClient.rows[0] && ownJob.rows[0] && otherJob.rows[0]) {
    await expectForeignKeyViolation("project_client_fk", `
      insert into public.maestro_projects (organization_id, legacy_record_id, client_id, name)
      values ($1, $2, $3, 'Invalid cross-tenant project')`,
    [organizationId, `invalid-project-${organizationId}`, crossTenantClient.rows[0].id]);
    await expectForeignKeyViolation("job_project_fk", `
      insert into public.maestro_jobs (organization_id, legacy_record_id, project_id, title)
      values ($1, $2, $3, 'Invalid cross-tenant project reference')`,
    [organizationId, `invalid-job-project-${organizationId}`, crossTenantProject.rows[0].id]);
    await expectForeignKeyViolation("job_client_fk", `
      insert into public.maestro_jobs (organization_id, legacy_record_id, client_id, title)
      values ($1, $2, $3, 'Invalid cross-tenant client reference')`,
    [organizationId, `invalid-job-client-${organizationId}`, crossTenantClient.rows[0].id]);
    await expectForeignKeyViolation("project_identity_pair_fk", `
      insert into public.maestro_projects (organization_id, legacy_record_id, client_id, client_legacy_record_id, name)
      values ($1, $2, $3, $4, 'Mismatched project client identity')`,
    [organizationId, `invalid-project-pair-${organizationId}`, ownClient.rows[0].id, ids.secondClient]);
    await expectForeignKeyViolation("job_project_identity_pair_fk", `
      insert into public.maestro_jobs (organization_id, legacy_record_id, project_id, project_legacy_record_id, title)
      values ($1, $2, $3, $4, 'Mismatched job project identity')`,
    [organizationId, `invalid-job-project-pair-${organizationId}`, projectA.rows[0].id, ids.secondProject]);
    await expectForeignKeyViolation("job_client_identity_pair_fk", `
      insert into public.maestro_jobs (organization_id, legacy_record_id, client_id, client_legacy_record_id, title)
      values ($1, $2, $3, $4, 'Mismatched job client identity')`,
    [organizationId, `invalid-job-client-pair-${organizationId}`, ownClient.rows[0].id, ids.secondClient]);
    await expectForeignKeyViolation("task_job_fk", `
      insert into public.maestro_job_tasks (organization_id, legacy_record_id, job_id, title)
      values ($1, $2, $3, 'Invalid cross-tenant task reference')`,
    [organizationId, `invalid-task-${organizationId}`, otherJob.rows[0].id]);
    await expectForeignKeyViolation("timesheet_client_identity_fk", `
      insert into public.maestro_timesheets (
        organization_id, legacy_record_id, client_id, client_legacy_record_id
      ) values ($1, $2, $3, $4)`,
    [organizationId, `invalid-timesheet-client-pair-${organizationId}`, crossTenantClient.rows[0].id, ids.secondClient]);
    await expectForeignKeyViolation("timesheet_project_identity_fk", `
      insert into public.maestro_timesheets (
        organization_id, legacy_record_id, project_id, project_legacy_record_id
      ) values ($1, $2, $3, $4)`,
    [organizationId, `invalid-timesheet-project-pair-${organizationId}`, crossTenantProject.rows[0].id, ids.secondProject]);
  } else {
    failures.push("integrity:relational_project_fixtures_missing");
  }

  await client.query("rollback");
  console.log(JSON.stringify({ status: failures.length ? "failed" : "ok", tested_organizations: [organizationId, secondOrganizationId], assertions: ["synthetic_relational_fixtures_seeded", "legacy_scope_configured_organization_applied", "legacy_scope_related_client_organization_applied", "legacy_webhook_receipt_routed_by_active_integration_to_correct_tenant", "unmapped_webhook_instance_left_unscoped_with_multiple_active_tenants", "explicit_tenant_subtask_dual_write", "legacy_cross_tenant_reassignment_denied", "project_schedule_cross_tenant_patch_denied", "project_schedule_same_tenant_patch_allowed", "authenticated_own_membership_visible", "authenticated_cross_tenant_membership_hidden", "authenticated_rls_own_tenant_read", "authenticated_rls_cross_tenant_read_denied", "authenticated_legacy_select_denied", "cross_tenant_relations_rejected_for_core_fks", "typed_and_legacy_identity_pairs_match", "mismatched_typed_and_legacy_identity_pairs_rejected", "timesheet_same_tenant_client_project_dual_write", "timesheet_unresolved_snapshots_preserved_and_updateable", "timesheet_cross_tenant_client_project_pairs_rejected", "parent_delete_clears_typed_fk_and_preserves_legacy_id_and_timesheet_snapshots"], failures }, null, 2));
  process.exitCode = failures.length ? 1 : 0;
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(JSON.stringify({ status: "failed", phase, error: error instanceof Error ? error.message : String(error), failures }, null, 2));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
