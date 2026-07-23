import { useState } from 'react';
import { formatDate } from '@/lib/dates/formatting';
import {
  getDepartmentFields,
  sectionHasData,
  type FieldContext,
  type SectionContent,
} from '@/lib/advances/fields';
import type { AdvanceSectionState, SectionStatus } from '@/lib/advances/sections';
import { SectionStatusBadge } from './SectionStatusBadge';
import { SectionContentForm } from '@/components/production/SectionContentForm';

interface AdvanceSectionProps {
  deptId: string;
  deptName: string;
  state: AdvanceSectionState;
  content: SectionContent;
  canEdit: boolean;
  canFinalize: boolean;
  canUnlock: boolean;
  statusPending: boolean;
  contentPending: boolean;
  /** Field context: 'advance' (per-artist) or 'production' (house package). */
  context?: FieldContext;
  onSetStatus: (deptId: string, status: SectionStatus) => void;
  onSaveContent: (deptId: string, content: SectionContent, bumpToInProgress: boolean) => void;
}

/** One department section on an advance: status controls + content fields. */
export function AdvanceSection({
  deptId,
  deptName,
  state,
  content,
  canEdit,
  canFinalize,
  canUnlock,
  statusPending,
  contentPending,
  context = 'advance',
  onSetStatus,
  onSaveContent,
}: AdvanceSectionProps) {
  const [open, setOpen] = useState(false);
  const fields = getDepartmentFields(deptId, context);
  const locked = state.status === 'complete';
  const readOnly = locked || !canEdit;

  return (
    <div className="border-b border-line/60 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 font-medium text-ink"
          aria-expanded={open}
        >
          <span className="text-ink-muted">{open ? '▾' : '▸'}</span>
          {deptName}
          {fields.length === 0 && <span className="text-xs text-ink-muted">(no fields yet)</span>}
        </button>
        <div className="flex items-center gap-2">
          {locked && state.finalizedAt && (
            <span className="text-xs text-ink-muted">Locked {formatDate(state.finalizedAt)}</span>
          )}
          <SectionStatusBadge status={state.status} />
          {state.status === 'not_started' && canEdit && (
            <SectionActionButton
              label="Start"
              pending={statusPending}
              onClick={() => onSetStatus(deptId, 'in_progress')}
            />
          )}
          {state.status === 'in_progress' && canFinalize && (
            <SectionActionButton
              label="Finalize"
              pending={statusPending}
              onClick={() => onSetStatus(deptId, 'complete')}
            />
          )}
          {state.status === 'complete' && canUnlock && (
            <SectionActionButton
              label="Unlock"
              pending={statusPending}
              onClick={() => onSetStatus(deptId, 'in_progress')}
            />
          )}
        </div>
      </div>

      {open && fields.length > 0 && (
        <div className="mt-3">
          {locked && <p className="mb-2 text-xs text-ink-muted">Finalized — unlock to edit.</p>}
          <SectionContentForm
            fields={fields}
            initial={content}
            readOnly={readOnly}
            pending={contentPending}
            onSave={(next) =>
              onSaveContent(deptId, next, state.status === 'not_started' && sectionHasData(next))
            }
          />
        </div>
      )}
    </div>
  );
}

function SectionActionButton({
  label,
  pending,
  onClick,
}: {
  label: string;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className="rounded border border-line px-2 py-0.5 text-xs transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
    >
      {label}
    </button>
  );
}
