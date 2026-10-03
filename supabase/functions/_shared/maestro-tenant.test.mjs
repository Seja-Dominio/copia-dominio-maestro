import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  accessLevelForOrganizationRole,
  organizationRoleForAccessLevel,
  profileForOrganizationRole,
  selectOrganizationMembership,
  selectUniqueGroupOrganization,
} from "./maestro-tenant.mjs";
import { canManageAdsBrain } from "./ads-brain-access.js";
import { collaboratorCanReadJob, jobContainsAttachmentPath, normalizeAttachmentPath } from "./attachment-access.mjs";

const organizationA = {
  organization_id: "org-a",
  role: "manager",
  status: "active",
  organizations: { name: "Agency A", slug: "agency-a", status: "active" },
};
const organizationB = {
  organization_id: "org-b",
  role: "member",
  status: "active",
  organizations: { name: "Agency B", slug: "agency-b", status: "active" },
};

test("uses the only active organization without requiring a new login field", () => {
  assert.deepEqual(selectOrganizationMembership([organizationA]), {
    ok: true,
    membership: {
      organization_id: "org-a",
      organization_name: "Agency A",
      organization_slug: "agency-a",
      organization_role: "manager",
    },
  });
});

test("requires an explicit organization when the collaborator belongs to several", () => {
  const result = selectOrganizationMembership([organizationA, organizationB]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "organization_required");
  assert.deepEqual(result.organizations.map(({ organization_id }) => organization_id), ["org-a", "org-b"]);
});

test("accepts only a selected active membership and rejects cross-tenant selection", () => {
  assert.equal(selectOrganizationMembership([organizationA, organizationB], "org-b").membership.organization_id, "org-b");
  assert.deepEqual(selectOrganizationMembership([organizationA], "org-b"), {
    ok: false,
    reason: "not_a_member",
    organizations: [],
  });
  assert.equal(selectOrganizationMembership([{ ...organizationA, organizations: { status: "suspended" } }]).reason, "no_active_membership");
});

test("maps organization membership roles to existing Maestro authorization levels", () => {
  assert.equal(accessLevelForOrganizationRole("owner"), "master");
  assert.equal(accessLevelForOrganizationRole("admin"), "master");
  assert.equal(accessLevelForOrganizationRole("manager"), "gestor");
  assert.equal(accessLevelForOrganizationRole("viewer"), "viewer");
  assert.equal(accessLevelForOrganizationRole("member"), "collaborator");
  assert.equal(organizationRoleForAccessLevel("master"), "admin");
  assert.equal(organizationRoleForAccessLevel("gestor"), "manager");
  assert.equal(organizationRoleForAccessLevel("viewer"), "viewer");
  assert.equal(organizationRoleForAccessLevel("collaborator"), "member");
});

test("uses the active organization role instead of global profile access", () => {
  const elevatedGlobalProfile = { access_level: "master", name: "Test" };
  const memberProfile = profileForOrganizationRole(elevatedGlobalProfile, "member");
  assert.equal(memberProfile.access_level, "collaborator");
  assert.equal(memberProfile.name, "Test");
  assert.equal(elevatedGlobalProfile.access_level, "master");

  const limitedGlobalProfile = { access_level: "collaborator" };
  const ownerProfile = profileForOrganizationRole(limitedGlobalProfile, "owner");
  assert.equal(ownerProfile.access_level, "master");
  assert.equal(canManageAdsBrain(ownerProfile), true);

  const memberWithGlobalAdmin = profileForOrganizationRole({ access_level: "master" }, "member");
  assert.equal(memberWithGlobalAdmin.access_level, "collaborator");
  assert.equal(canManageAdsBrain(memberWithGlobalAdmin), false);
});

test("resolves group scope only when every matching directory row belongs to one organization", () => {
  assert.equal(selectUniqueGroupOrganization([{ organization_id: "org-a" }, { organization_id: "org-a" }]), "org-a");
  assert.equal(selectUniqueGroupOrganization([{ organization_id: "org-a" }, { organization_id: "org-b" }]), null);
  assert.equal(selectUniqueGroupOrganization([]), null);
});

test("attachment access normalizes stored URLs, proves job ownership and checks collaborator assignment", () => {
  assert.equal(normalizeAttachmentPath("https://example.test/storage/v1/object/sign/job-attachments/org-a/user-a/file.png?token=x"), "org-a/user-a/file.png");
  const job = { id: "job-1", responsible_id: "member-a", attachments: [{ path: "org-a/member-a/file.png" }] };
  assert.equal(jobContainsAttachmentPath(job, [], "org-a/member-a/file.png"), true);
  assert.equal(jobContainsAttachmentPath(job, [], "org-b/member-b/private.png"), false);
  assert.equal(collaboratorCanReadJob({ accessLevel: "collaborator", collaboratorId: "member-a", jobPayload: job }), true);
  assert.equal(collaboratorCanReadJob({ accessLevel: "collaborator", collaboratorId: "member-b", jobPayload: job }), false);
  assert.equal(collaboratorCanReadJob({ accessLevel: "master", collaboratorId: "member-b", jobPayload: job }), true);
});

test("the production data endpoint derives organization scope from active memberships", async () => {
  const source = await fs.readFile(new URL("../maestro-data/index.ts", import.meta.url), "utf8");
  assert.match(source, /from\("organization_members"\)/);
  assert.match(source, /\.eq\("collaborator_id", session\.sub\)/);
  assert.match(source, /\.eq\("organizations\.status", "active"\)/);
  assert.match(source, /selectOrganizationMembership\(memberships, session\.organization_id\)/);
});

test("legacy record reads and mutations in maestro-data are constrained to the session organization", async () => {
  const source = await fs.readFile(new URL("../maestro-data/index.ts", import.meta.url), "utf8");
  assert.match(source, /\.eq\("organization_id", organizationId\)/);
  assert.match(source, /\.eq\("organization_id", session\.organization_id\)/);
  assert.match(source, /organization_id: session\.organization_id,[\s\S]{0,140}payload: nextPayload/);
  assert.match(source, /organization_id: session\.organization_id,[\s\S]{0,140}payload, source_created_at/);
  assert.match(source, /\.eq\("record_id", recordId\)\s*\.eq\("organization_id", session\.organization_id\)/);
});

test("admin-timesheets authorizes master role from active membership and uses scoped atomic operations", async () => {
  const source = await fs.readFile(new URL("../admin-timesheets/index.ts", import.meta.url), "utf8");
  assert.match(source, /from\("organization_members"\)/);
  assert.match(source, /selectOrganizationMembership\(memberships, session\.organization_id\)/);
  assert.match(source, /accessLevelForOrganizationRole\(choice\.membership\.organization_role\) !== "master"/);
  assert.match(source, /supabase\.rpc\(rpc, args\)/);
  assert.match(source, /"maestro_delete_timesheets_with_audit"/);
  assert.match(source, /"maestro_reset_running_timesheets"/);
  assert.match(source, /p_organization_id: actor\.session\.organization_id/g);
  assert.doesNotMatch(source, /from\("legacy_records"\)/);
  assert.match(source, /\.select\("product_key,status,expires_at"\)[\s\S]*?\.eq\("organization_id", choice\.membership\.organization_id\)[\s\S]*?\.eq\("product_key", "maestro"\)/);
  assert.match(source, /if \(productsError \|\| !hasActiveOrganizationProduct\(products, "maestro"\)\) return null;/);
  assert.ok(source.indexOf('if (productsError || !hasActiveOrganizationProduct(products, "maestro"))') < source.indexOf('if (action === "clear")'));
});

test("Maestro AI validates organization membership and scopes every data source", async () => {
  const source = await fs.readFile(new URL("../maestro-ai/index.ts", import.meta.url), "utf8");
  assert.match(source, /from\("organization_members"\)/);
  assert.match(source, /selectOrganizationMembership\(memberships, String\(payload\.organization_id \|\| ""\)\)/);
  assert.match(source, /organization_id: choice\.membership\.organization_id/);
  assert.match(source, /\.eq\("entity", entity\)\.eq\("organization_id", organizationId\)/);
  assert.match(source, /query = query\.eq\("organization_id", session\.organization_id\)/);
  assert.match(source, /organization_id: session\.organization_id,[\s\S]{0,100}payload:/);
  assert.match(source, /O cliente não pertence à organização ativa/);
});

test("team chat revalidates the active organization and scopes every channel, message, member and reaction operation", async () => {
  const source = await fs.readFile(new URL("../team-chat/index.ts", import.meta.url), "utf8");
  assert.match(source, /from\("organization_members"\)/);
  assert.match(source, /selectOrganizationMembership\(memberships, session\.organization_id\)/);
  assert.match(source, /function loadChannels\(organizationId: string\)[\s\S]*?\.eq\("organization_id", organizationId\)/);
  assert.match(source, /function assertChannel\(channelId: string, organizationId: string\)[\s\S]*?\.eq\("organization_id", organizationId\)/);
  assert.match(source, /function loadMessages\(channelId: string, organizationId: string\)[\s\S]*?\.eq\("organization_id", organizationId\)/);
  assert.match(source, /function loadCollaborators\(organizationId: string, onlyIds\?: string\[\]\)[\s\S]*?\.eq\("organization_id", organizationId\)/);
  assert.match(source, /\.from\("team_chat_message_reactions"\)[\s\S]*?\.eq\("organization_id", organizationId\)/);
  assert.match(source, /\.insert\(\{ organization_id: session\.organization_id, channel_id: channelId/);
  assert.match(source, /\.insert\(\{ organization_id: session\.organization_id, message_id: messageId/);
  assert.match(source, /\.eq\("organization_id", session\.organization_id \|\| ""\)/);
  assert.match(source, /\.select\("product_key,status,expires_at"\)[\s\S]*?\.eq\("organization_id", choice\.membership\.organization_id\)[\s\S]*?\.eq\("product_key", "maestro"\)/);
  assert.match(source, /if \(productsError \|\| !hasActiveOrganizationProduct\(products, "maestro"\)\) return null;/);
  assert.ok(source.indexOf('if (productsError || !hasActiveOrganizationProduct(products, "maestro"))') < source.indexOf("async function loadChannels"));
});

test("credential administration requires an active org admin and cannot overwrite global authorization profile", async () => {
  const source = await fs.readFile(new URL("../hash-collaborator-password/index.ts", import.meta.url), "utf8");
  assert.match(source, /selectOrganizationMembership\(memberships, session\.organization_id\)/);
  assert.match(source, /session\.access_level !== "master" \|\| !organizationId/);
  assert.match(source, /\.eq\("organization_id", organizationId\)[\s\S]*?\.eq\("collaborator_id", String\(collaboratorId\)\)/);
  assert.match(source, /"Colaborador não encontrado nesta organização/);
  assert.match(source, /\.select\("product_key,status,expires_at"\)[\s\S]*?\.eq\("organization_id", organizationId\)[\s\S]*?\.eq\("product_key", "maestro"\)/);
  assert.match(source, /if \(!hasActiveOrganizationProduct\(products, "maestro"\)\)/);
  assert.ok(source.indexOf('if (!hasActiveOrganizationProduct(products, "maestro"))') < source.indexOf(".from(\"organization_members\")\n      .select(\"collaborator_id, status"));
  assert.match(source, /\.update\(\{[\s\S]*?password_hash: hashedPassword/);
  assert.doesNotMatch(source, /legacy_records|profile,\s*source_updated_at/);

  const modal = await fs.readFile(new URL("../../../src/components/collaborators/AccessCredentialsModal.jsx", import.meta.url), "utf8");
  assert.match(modal, /hashCollaboratorPassword\([\s\S]*?collaboratorId: collaborator\.id,[\s\S]*?login: formData\.login,[\s\S]*?\}\);[\s\S]*?maestro\.entities\.Collaborator\.update\(collaborator\.id/);
});

test("Dominus memory reviews, rules, events and comments stay inside the active organization", async () => {
  const source = await fs.readFile(new URL("../dominus-memory/index.ts", import.meta.url), "utf8");
  assert.match(source, /authorizeDominusAuditSession\(\{ payload, collaborator: data, memberships, products \}\)/);
  assert.match(source, /\.eq\("organization_id", String\(payload\.organization_id\)\)/);
  assert.match(source, /\.eq\("product_key", "maestro"\)/);
  assert.match(source, /async function listMemory\(organizationId: string\)[\s\S]*?dominus_learning_reviews[\s\S]*?\.eq\("organization_id", organizationId\)[\s\S]*?dominus_memory[\s\S]*?\.eq\("organization_id", organizationId\)/);
  assert.match(source, /function recordEvent[\s\S]*?organization_id: session\.organization_id/);
  assert.match(source, /\.insert\(\{ organization_id: session\.organization_id, review_id: reviewId, author_id: session\.sub/);
  assert.match(source, /\.eq\("organization_id", session\.organization_id\)/);
  assert.match(source, /organization_id: session\.organization_id,/);
});

test("system reports derives admin access from the selected membership and exports only that tenant", async () => {
  const source = await fs.readFile(new URL("../system-reports/index.ts", import.meta.url), "utf8");
  assert.match(source, /selectOrganizationMembership\(memberships, session\.organization_id\)/);
  assert.match(source, /accessLevelForOrganizationRole\(choice\.membership\.organization_role\)/);
  assert.match(source, /sessionPayload\.access_level !== "master"/);
  assert.match(source, /async function load\(entity: string, organizationId: string\)[\s\S]*?\.eq\("organization_id", organizationId\)/);
  assert.match(source, /\.eq\("organization_id", sessionPayload\.organization_id\)/);
  assert.doesNotMatch(source, /data\.profile\?\.access_level/);
});

test("traffic copilot authorizes and reads ads accounts only for the active organization", async () => {
  const source = await fs.readFile(new URL("../traffic-copilot/index.ts", import.meta.url), "utf8");
  assert.match(source, /selectOrganizationMembership\(memberships, session\.organization_id\)/);
  assert.match(source, /accessLevelForOrganizationRole\(choice\.membership\.organization_role\)/);
  assert.match(source, /organization_id: choice\.membership\.organization_id/);
  assert.match(source, /from\("maestro_ads_accounts"\)[\s\S]*?\.eq\("organization_id", collaborator\.organization_id\)/);
  assert.match(source, /if \(accountIds\.length\) query = query\.in\("id", accountIds\)/);
  const handler = source.indexOf("Deno.serve");
  const productGate = source.indexOf('if (!hasActiveOrganizationProduct(products, "ads_brain"))', handler);
  const accountRead = source.indexOf('from("maestro_ads_accounts")', handler);
  assert.ok(productGate >= 0 && productGate < accountRead);
  assert.match(source, /\.select\("product_key,status,expires_at"\)[\s\S]*?\.eq\("organization_id", collaborator\.organization_id\)[\s\S]*?\.eq\("product_key", "ads_brain"\)/);
});

test("Meta Ads OAuth and synchronization keep accounts, credentials, client insights and OAuth state tenant-bound", async () => {
  const source = await fs.readFile(new URL("../meta-ads-oauth/index.ts", import.meta.url), "utf8");
  assert.match(source, /selectOrganizationMembership\(memberships, session\.organization_id\)/);
  assert.match(source, /profileForOrganizationRole\([\s\S]{0,100}membership\.organization_role/);
  assert.match(source, /hasAdsBrainAccess\(authorizedProfile\)/);
  assert.match(source, /canManageAdsBrain\(authorizedProfile\)/);
  assert.doesNotMatch(source, /canManageAdsBrain\(\(collaborator\.profile/);
  assert.match(source, /\.insert\(\{ organization_id: organizationId, collaborator_id: collaborator\.id/);
  assert.match(source, /\.eq\("id", accountId\)\.eq\("organization_id", organizationId\)/);
  assert.match(source, /\.eq\("organization_id", organizationId\)[\s\S]*?\.order\("updated_at"/);
  assert.match(source, /async function loadCompetitiveContext\(clientId: string, organizationId: string[\s\S]*?\.eq\("organization_id", organizationId\)/);
  assert.match(source, /organization_id: organizationId,[\s\S]{0,120}collaborator_id: collaborator\.id/);
  assert.match(source, /isMetaOAuthStateBound\(oauthState, collaborator\.id, organizationId\)/);
  assert.match(source, /nonce_hash: await hashMetaOAuthNonce\(nonce\)/);
  assert.match(source, /campaign_create[\s\S]*campaign_update[\s\S]*campaign_set_status/);
  const handler = source.indexOf("Deno.serve");
  const productGate = source.indexOf('if (!hasActiveOrganizationProduct(adsProducts, "maestro")', handler);
  const accountRead = source.indexOf('from("maestro_ads_accounts")', handler);
  assert.ok(productGate >= 0 && productGate < accountRead);
  assert.match(source, /\.select\("product_key,status,expires_at"\)[\s\S]*?\.eq\("organization_id", organizationId\)[\s\S]*?\.in\("product_key", \["maestro", "ads_brain"\]\)/);
});

test("public job approval links resolve the tenant from the signed job and keep all effects there", async () => {
  const source = await fs.readFile(new URL("../handle-job-approval/index.ts", import.meta.url), "utf8");
  assert.match(source, /\.select\("payload,organization_id"\)/);
  assert.match(source, /if \(!jobRecord\?\.payload \|\| !jobRecord\.organization_id\)/);
  assert.match(source, /async function updateRecord\(entity: string, recordId: string, organizationId: string/);
  assert.match(source, /async function createRecord\(entity: string, organizationId: string/);
  assert.match(source, /organization_id: organizationId,[\s\S]{0,80}payload: nextPayload/);
  assert.match(source, /await updateRecord\("Job", String\(jobId\), organizationId/);
  assert.match(source, /createRecord\("Notification", organizationId/);
  assert.match(source, /\.select\("product_key,status,expires_at"\)[\s\S]*?\.eq\("organization_id", organizationId\)[\s\S]*?\.eq\("product_key", "maestro"\)/);
  assert.match(source, /if \(!hasActiveOrganizationProduct\(products, "maestro"\)\)/);
  assert.ok(source.indexOf('if (!hasActiveOrganizationProduct(products, "maestro"))') < source.indexOf('if (action === "load")'));
});

test("file upload uses tenant paths and signed URL refresh requires membership and job attachment access", async () => {
  const upload = await fs.readFile(new URL("../upload-file/index.ts", import.meta.url), "utf8");
  const refresh = await fs.readFile(new URL("../refresh-file-url/index.ts", import.meta.url), "utf8");
  assert.match(upload, /selectOrganizationMembership\(memberships, session\.organization_id\)/);
  assert.match(upload, /\$\{session\.organization_id\}\/\$\{session\.sub\}\//);
  assert.match(refresh, /selectOrganizationMembership\(memberships, session\.organization_id\)/);
  assert.match(refresh, /\.eq\("organization_id", verified\.session\.organization_id\)/);
  assert.match(refresh, /collaboratorCanReadJob\(/);
  assert.match(refresh, /jobContainsAttachmentPath\(/);
  assert.ok(refresh.indexOf("jobContainsAttachmentPath(") < refresh.indexOf("createSignedUrl(path"));
});
