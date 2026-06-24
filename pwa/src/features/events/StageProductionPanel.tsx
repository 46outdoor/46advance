import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { createLogger } from '@/lib/logger';
import { canEditEvent } from '@/lib/rbac/permissions';
import type { SectionContent } from '@/lib/advances/fields';
import { canFinalizeSection, canUnlockSection, type SectionStatus } from '@/lib/advances/sections';
import type { EventRole } from '@/lib/rbac/roles';
import { listDepartments } from '@/lib/departments/departments-service';
import type { ProductionAttachment } from '@/lib/production/production';
import { getEvent } from './events-service';
import {
  addStageProductionAttachment,
  getStageProduction,
  removeStageProductionAttachment,
  updateStageProductionContent,
  updateStageProductionStatus,
} from './production-service';
import { AdvanceSection } from './AdvanceSection';
import { AttachmentsEditor } from './AttachmentsEditor';

const logger = createLogger('Production');

/** Per-stage technical production (house package): one section per enabled department. */
export function StageProductionPanel({
  eventId,
  stageId,
  role,
}: {
  eventId: string;
  stageId: string;
  role: EventRole | null;
}) {
  const { user, isAdmin, isOrganizer } = useAuth();
  const queryClient = useQueryClient();

  const productionQuery = useQuery({
    queryKey: ['stage-production', eventId, stageId],
    queryFn: () => getStageProduction(eventId, stageId),
  });
  const eventQuery = useQuery({
    queryKey: ['events', 'detail', eventId],
    queryFn: () => getEvent(eventId),
  });
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: listDepartments });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['stage-production', eventId, stageId] });

  const setStatus = useMutation({
    mutationFn: ({ key, status }: { key: string; status: SectionStatus }) =>
      updateStageProductionStatus(eventId, stageId, key, status, user!.uid),
    onSuccess: invalidate,
    onError: (err) => logger.error('Failed to update production status', err),
  });
  const saveContent = useMutation({
    mutationFn: ({ deptId, content, bump }: { deptId: string; content: SectionContent; bump: boolean }) =>
      updateStageProductionContent(eventId, stageId, deptId, content, bump),
    onSuccess: invalidate,
    onError: (err) => logger.error('Failed to save production content', err),
  });
  const uploadAttachment = useMutation({
    mutationFn: (file: File) => addStageProductionAttachment(eventId, stageId, file, user!.uid),
    onSuccess: invalidate,
    onError: (err) => logger.error('Failed to upload attachment', err),
  });
  const removeAttachment = useMutation({
    mutationFn: (a: ProductionAttachment) => removeStageProductionAttachment(eventId, stageId, a),
    onSuccess: invalidate,
    onError: (err) => logger.error('Failed to remove attachment', err),
  });

  const viewer = user ? { uid: user.uid, isAdmin, isOrganizer } : null;
  const canEdit = viewer ? canEditEvent(viewer, role) : false;
  const canFinalize = viewer ? canFinalizeSection(viewer, role) : false;
  const canUnlock = viewer ? canUnlockSection(viewer, role) : false;

  const enabledIds = new Set(eventQuery.data?.departmentIds ?? []);
  const sectionRows = (departmentsQuery.data ?? []).filter((d) => enabledIds.has(d.id));
  const production = productionQuery.data;

  return (
    <div className="space-y-1 border-t border-line pt-6">
      <h2 className="mb-2 font-display text-xl font-bold text-brand">Production (house package)</h2>
      {sectionRows.length === 0 && (
        <p className="text-sm text-ink-muted">No departments enabled for this event.</p>
      )}
      {production &&
        sectionRows.map((dept) => (
          <AdvanceSection
            key={dept.id}
            deptId={dept.id}
            deptName={dept.name}
            context="production"
            state={
              production.sections[dept.id] ?? { status: 'not_started', finalizedAt: null, finalizedBy: null }
            }
            content={production.content[dept.id] ?? {}}
            canEdit={canEdit}
            canFinalize={canFinalize}
            canUnlock={canUnlock}
            statusPending={setStatus.isPending}
            contentPending={saveContent.isPending}
            onSetStatus={(deptId, status) => setStatus.mutate({ key: deptId, status })}
            onSaveContent={(deptId, content, bump) => saveContent.mutate({ deptId, content, bump })}
          />
        ))}

      {production && (
        <div className="pt-3">
          <h3 className="mb-2 text-sm font-semibold text-ink">Attachments (plots / CAD)</h3>
          <AttachmentsEditor
            attachments={production.attachments}
            readOnly={!canEdit}
            uploading={uploadAttachment.isPending}
            onUpload={(f) => uploadAttachment.mutate(f)}
            onRemove={(a) => removeAttachment.mutate(a)}
          />
        </div>
      )}
    </div>
  );
}
