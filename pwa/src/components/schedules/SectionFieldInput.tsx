import type { ScheduleFieldDef } from '@/lib/schedules/itemTypes';

/** A single section-specific schedule field control (select or text/number input), shared by
 * the per-event schedule item form and the schedule-template item form. */
export function SectionFieldInput({
  field,
  value,
  className,
  onChange,
}: {
  field: ScheduleFieldDef;
  value: string;
  /** Input styling from the host form. */
  className: string;
  onChange: (value: string) => void;
}) {
  if (field.type === 'select') {
    return (
      <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {field.options?.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={field.type === 'number' ? 'number' : 'text'}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
