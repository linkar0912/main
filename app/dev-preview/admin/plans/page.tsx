import { notFound } from "next/navigation";

import { PlansScreen } from "@/src/components/admin/plans-screen";
import { inviteCodes, plans } from "../fixtures";

export default function PlansPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PlansScreen plans={plans} inviteCodes={inviteCodes} />;
}
