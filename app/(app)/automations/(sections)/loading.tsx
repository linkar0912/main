import { AutomationSectionLoading } from "@/src/components/automation-sections-shell";

// Renders inside the sections layout, so only the content area shows a
// placeholder - the header and section switch never flash.
export default function Loading() {
  return <AutomationSectionLoading />;
}
