import { notFound } from "next/navigation";
import { TemplatePickerPreview } from "./template-picker-preview";

export const metadata = { title: "Choose a template · Linkar (preview)" };

/**
 * Dev-only: the template picker, open on arrival over the real workspace
 * shell. With ?state=empty, Facebook has no connected Page.
 */
export default function TemplatePickerPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <TemplatePickerPreview />;
}
