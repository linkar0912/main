import { PublicPage } from "@/src/components/public-page";
import { getRepository } from "@/src/lib/repository-provider";

export const dynamic = "force-dynamic";

type StatusPageProps = { params: Promise<{ code: string }> };

export default async function DataDeletionStatusPage({ params }: StatusPageProps) {
  const { code } = await params;
  const request = await getRepository().getDataDeletionRequest(code);

  return (
    <PublicPage title="Deletion request status" intro={request ? "This Meta data deletion request has been completed." : "We could not find a deletion request with this confirmation code."}>
      <h2>Status</h2>
      {request ? (
        <p><strong>Completed.</strong> The connected Instagram token, connection, automations, delivery records, and webhook events associated with the connected workspace were removed. Confirmation code: <code>{request.confirmationCode}</code>.</p>
      ) : (
        <p>Check the confirmation code returned by Meta and try the exact status URL again. This page does not expose Instagram account identifiers.</p>
      )}
    </PublicPage>
  );
}
