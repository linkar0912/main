export function AutomationPriorityField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="field field-spaced">
      <span>Priority</span>
      <input aria-label="Priority" type="number" min={-100} max={100} value={value} onChange={(event) => onChange(event.target.value)} />
      <small>Use a higher number when this reply should win over another matching reply.</small>
    </label>
  );
}
