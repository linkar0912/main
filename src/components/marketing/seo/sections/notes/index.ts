import type { ComponentType } from "react";
import type { SeoPage } from "@/src/content/seo";
import type { NotesVariant } from "../../seo-layout";
import { NotesSplit } from "./split";
import { NotesStatement } from "./statement";

export const notesVariants: Record<NotesVariant, ComponentType<{ page: SeoPage }>> = {
  split: NotesSplit,
  statement: NotesStatement,
};
