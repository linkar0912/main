import { notFound } from "next/navigation";

import { PlansScreen } from "@/src/components/admin/plans-screen";
import { inviteCodes, inviteCodesLong, plans, plansLong, previewState } from "../fixtures";

export default async function PlansPreview({ searchParams }: PageProps<"/dev-preview/admin/plans">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const state = previewState((await searchParams).state);
  if (state === "empty") return <PlansScreen plans={[]} inviteCodes={[]} />;
  return <PlansScreen plans={state === "long" ? plansLong : plans} inviteCodes={state === "long" ? inviteCodesLong : inviteCodes} />;
}
