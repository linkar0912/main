import { Field } from "./wizard";

export function AutomationPriorityField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Field label="Priority" hint="When two automations match the same comment or message, the higher number replies. Most people leave this at 0.">
      <input type="number" min={-100} max={100} value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}
