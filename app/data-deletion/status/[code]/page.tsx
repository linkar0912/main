import type { Metadata } from "next";
import { PublicPage } from "@/src/components/public-page";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { getRepository } from "@/src/lib/repository-provider";

export const dynamic = "force-dynamic";

// Each status URL carries a confirmation code; none of them belong in search.
export const metadata: Metadata = {
  title: `Deletion request status · ${PRODUCT_NAME}`,
  robots: { index: false, follow: false },
};

type StatusPageProps = { params: Promise<{ code: string }> };

export default async function DataDeletionStatusPage({ params }: StatusPageProps) {
  const { code } = await params;
  const request = await getRepository().getDataDeletionRequest(code);

  const completed = request?.status === "COMPLETED";
  return (
    <PublicPage title="Deletion request status" intro={completed ? "This Meta data deletion request has been completed." : request ? "This Meta data deletion request is still being completed." : "We could not find a deletion request with this confirmation code."}>
      <h2>Status</h2>
      {request ? (
        <p><strong>{completed ? "Completed." : "Pending."}</strong> {completed ? `The connected Meta account and its related ${PRODUCT_NAME} data were removed.` : `${PRODUCT_NAME} is finishing the removal of data linked to this connection.`} Confirmation code: <code>{request.confirmationCode}</code>.</p>
      ) : (
        <p>Check the confirmation code returned by Meta and try the exact status URL again. This page does not expose Instagram or Facebook identifiers.</p>
      )}
    </PublicPage>
  );
}
