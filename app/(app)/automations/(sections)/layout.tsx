import { AutomationSectionsShell } from "@/src/components/automation-sections-shell";

// Shared by My Automations, Sequences and Broadcasts so the header and the
// section switch stay mounted while moving between them.
export default function AutomationSectionsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AutomationSectionsShell>{children}</AutomationSectionsShell>;
}
