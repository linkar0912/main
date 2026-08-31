export function AutomationPriorityField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="field field-spaced">
      <span>Priority</span>
      <input aria-label="Priority" type="number" min={-100} max={100} value={value} onChange={(event) => onChange(event.target.value)} />
      <small>Higher-priority automations win when more than one flow matches the same comment.</small>
    </label>
  );
}
