import { get, getAll, getAllByIndex, put, del, getByIndex } from './db';
import { uid } from '../utils/uid';
import { sanitizeText } from '../utils/validation';
import { diffBom } from '../utils/bom-diff';
import type {
  BomDiff,
  BomItem,
  Plan,
  PlanFilters,
  PlanVersion,
  PlanWithBom,
  ShareToken,
  PlanStatus
} from '../types/plan.types';
import * as audit from './audit.service';
import * as notif from './notification.service';
import { authorize } from './authz.service';

interface CreatePlanInput {
  title: string;
  tags?: string[];
  notes?: string;
  status?: PlanStatus;
}

export async function createPlan(input: CreatePlanInput, actorId: string): Promise<Plan> {
  await authorize(actorId, 'plan:create');
  const title = sanitizeText(input.title);
  if (!title) throw new Error('Title is required');
  const now = Date.now();
  const plan: Plan = {
    id: uid(),
    title,
    status: input.status ?? 'draft',
    tags: (input.tags ?? []).map(sanitizeText).filter(Boolean),
    notes: sanitizeText(input.notes ?? ''),
    currentVersion: 0,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now
  };
  await put('plans', plan);
  await audit.log({
    actor: actorId,
    action: 'plan_created',
    resourceType: 'plan',
    resourceId: plan.id,
    detail: { title }
  });
  return plan;
}

export async function copyPlan(planId: string, newTitle: string, actorId: string): Promise<Plan> {
  await authorize(actorId, 'plan:create');
  const source = await get('plans', planId);
  if (!source) throw new Error('Plan not found');
  const now = Date.now();
  const plan: Plan = {
    ...source,
    id: uid(),
    title: sanitizeText(newTitle) || `${source.title} (copy)`,
    currentVersion: 0,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now
  };
  await put('plans', plan);
  const bom = await getAllByIndex('bom_items', 'by_plan', planId);
  for (const item of bom) {
    await put('bom_items', { ...item, id: uid(), planId: plan.id });
  }
  await audit.log({
    actor: actorId,
    action: 'plan_copied',
    resourceType: 'plan',
    resourceId: plan.id,
    detail: { sourceId: planId }
  });
  return plan;
}

export async function getPlan(id: string): Promise<PlanWithBom | undefined> {
  const plan = await get('plans', id);
  if (!plan) return undefined;
  const bom = (await getAllByIndex('bom_items', 'by_plan', id)).sort((a, b) => a.sortOrder - b.sortOrder);
  return { ...plan, bom };
}

export async function listPlans(filters: PlanFilters = {}): Promise<Plan[]> {
  let plans: Plan[];
  if (filters.status) plans = await getAllByIndex('plans', 'by_status', filters.status);
  else plans = await getAll('plans');
  const q = filters.search?.trim().toLowerCase();
  return plans
    .filter((p) => {
      if (filters.tag && !p.tags.includes(filters.tag)) return false;
      if (filters.createdBy && p.createdBy !== filters.createdBy) return false;
      if (q) {
        const hay = (p.title + ' ' + p.notes + ' ' + p.tags.join(' ')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function updatePlan(
  id: string,
  patch: Partial<Pick<Plan, 'title' | 'status' | 'tags' | 'notes'>>,
  actorId: string
): Promise<Plan> {
  await authorize(actorId, 'plan:update');
  const plan = await get('plans', id);
  if (!plan) throw new Error('Plan not found');
  const now = Date.now();
  const updated: Plan = {
    ...plan,
    title: patch.title != null ? sanitizeText(patch.title) : plan.title,
    status: patch.status ?? plan.status,
    tags: patch.tags ? patch.tags.map(sanitizeText).filter(Boolean) : plan.tags,
    notes: patch.notes != null ? sanitizeText(patch.notes) : plan.notes,
    updatedAt: now
  };
  await put('plans', updated);
  await audit.log({
    actor: actorId,
    action: 'plan_updated',
    resourceType: 'plan',
    resourceId: id,
    detail: { fields: Object.keys(patch) }
  });
  return updated;
}

export async function addBomItem(
  planId: string,
  item: Omit<BomItem, 'id' | 'planId'>,
  actorId: string = 'system'
): Promise<BomItem> {
  await authorize(actorId, 'plan:bom_mutate');
  const record: BomItem = {
    ...item,
    id: uid(),
    planId,
    partNumber: sanitizeText(item.partNumber),
    description: sanitizeText(item.description),
    unit: sanitizeText(item.unit || 'ea'),
    quantity: Number(item.quantity) || 0,
    unitCost: Number(item.unitCost) || 0
  };
  await put('bom_items', record);
  return record;
}

export async function updateBomItem(
  itemId: string,
  patch: Partial<BomItem>,
  actorId: string = 'system'
): Promise<BomItem> {
  await authorize(actorId, 'plan:bom_mutate');
  const existing = await get('bom_items', itemId);
  if (!existing) throw new Error('BOM item not found');
  const merged: BomItem = {
    ...existing,
    ...patch,
    id: existing.id,
    planId: existing.planId,
    partNumber: patch.partNumber != null ? sanitizeText(patch.partNumber) : existing.partNumber,
    description: patch.description != null ? sanitizeText(patch.description) : existing.description
  };
  await put('bom_items', merged);
  return merged;
}

export async function removeBomItem(
  itemId: string,
  actorId: string = 'system'
): Promise<void> {
  await authorize(actorId, 'plan:bom_mutate');
  await del('bom_items', itemId);
}

export async function saveVersion(
  planId: string,
  changeNote: string,
  actorId: string
): Promise<PlanVersion> {
  await authorize(actorId, 'plan:version');
  const note = sanitizeText(changeNote);
  if (!note) throw new Error('Change note is required for Save Version');
  const plan = await get('plans', planId);
  if (!plan) throw new Error('Plan not found');
  const bom = (await getAllByIndex('bom_items', 'by_plan', planId)).sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
  const nextVersion = plan.currentVersion + 1;
  const version: PlanVersion = {
    id: uid(),
    planId,
    version: nextVersion,
    bom: bom.map((b) => ({ ...b })),
    savedBy: actorId,
    savedAt: Date.now(),
    changeNote: note
  };
  await put('plan_versions', version);
  await put('plans', { ...plan, currentVersion: nextVersion, updatedAt: Date.now() });
  await audit.log({
    actor: actorId,
    action: 'plan_version_saved',
    resourceType: 'plan',
    resourceId: planId,
    detail: { version: nextVersion, note }
  });
  await notif.dispatch('plan_saved', actorId, {
    planTitle: plan.title,
    version: String(nextVersion)
  });
  return version;
}

export async function listVersions(planId: string): Promise<PlanVersion[]> {
  const versions = await getAllByIndex('plan_versions', 'by_plan', planId);
  return versions.sort((a, b) => a.version - b.version);
}

export async function rollback(
  planId: string,
  versionId: string,
  actorId: string
): Promise<PlanWithBom> {
  await authorize(actorId, 'plan:rollback');
  const target = await get('plan_versions', versionId);
  if (!target || target.planId !== planId) throw new Error('Version not found');
  const plan = await get('plans', planId);
  if (!plan) throw new Error('Plan not found');
  // wipe current live BOM
  const current = await getAllByIndex('bom_items', 'by_plan', planId);
  for (const c of current) await del('bom_items', c.id);
  // restore from snapshot with fresh IDs on the live copy
  for (const snap of target.bom) {
    await put('bom_items', { ...snap, id: uid(), planId });
  }
  await put('plans', { ...plan, updatedAt: Date.now() });
  await audit.log({
    actor: actorId,
    action: 'plan_rollback',
    resourceType: 'plan',
    resourceId: planId,
    detail: { version: target.version }
  });
  const bom = await getAllByIndex('bom_items', 'by_plan', planId);
  return { ...plan, bom };
}

export function diff(a: PlanVersion, b: PlanVersion): BomDiff {
  return diffBom(a.bom, b.bom);
}

export async function diffById(aId: string, bId: string): Promise<BomDiff> {
  const a = await get('plan_versions', aId);
  const b = await get('plan_versions', bId);
  if (!a || !b) throw new Error('Version not found');
  return diff(a, b);
}

// ---------------- Share tokens ----------------

export async function generateShareToken(
  planId: string,
  validDays: number,
  actorId: string
): Promise<ShareToken> {
  await authorize(actorId, 'plan:share');
  const days = Math.max(1, Math.min(90, Math.floor(validDays) || 7));
  const token: ShareToken = {
    id: uid(),
    planId,
    token: uid().replace(/-/g, ''),
    createdBy: actorId,
    expiresAt: Date.now() + days * 86400_000,
    revoked: false,
    createdAt: Date.now()
  };
  await put('share_tokens', token);
  await audit.log({
    actor: actorId,
    action: 'share_token_created',
    resourceType: 'plan',
    resourceId: planId,
    detail: { tokenId: token.id, validDays: days }
  });
  return token;
}

export async function listShareTokens(planId: string): Promise<ShareToken[]> {
  return (await getAllByIndex('share_tokens', 'by_plan', planId)).sort(
    (a, b) => b.createdAt - a.createdAt
  );
}

export async function revokeShareToken(tokenId: string, actorId: string): Promise<void> {
  await authorize(actorId, 'plan:share');
  const t = await get('share_tokens', tokenId);
  if (!t) throw new Error('Token not found');
  await put('share_tokens', { ...t, revoked: true });
  await audit.log({
    actor: actorId,
    action: 'share_token_revoked',
    resourceType: 'plan',
    resourceId: t.planId,
    detail: { tokenId }
  });
}

export async function validateShareToken(tokenStr: string): Promise<PlanWithBom | null> {
  const t = await getByIndex('share_tokens', 'by_token', tokenStr);
  if (!t || t.revoked) return null;
  if (t.expiresAt <= Date.now()) return null;
  return (await getPlan(t.planId)) ?? null;
}

export const planService = {
  createPlan,
  copyPlan,
  getPlan,
  listPlans,
  updatePlan,
  addBomItem,
  updateBomItem,
  removeBomItem,
  saveVersion,
  listVersions,
  rollback,
  diff,
  diffById,
  generateShareToken,
  listShareTokens,
  revokeShareToken,
  validateShareToken
};
