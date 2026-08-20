import { PublicPage } from "@/src/components/public-page";
import { getRepository } from "@/src/lib/repository-provider";

export const dynamic = "force-dynamic";

type StatusPageProps = { params: Promise<{ code: string }> };

export default async function DataDeletionStatusPage({ params }: StatusPageProps) {
  const { code } = await params;
  const request = await getRepository().getDataDeletionRequest(code);

  const completed = request?.status === "COMPLETED";
  return (
    <PublicPage title="Deletion request status" intro={completed ? "This Meta data deletion request has been completed." : request ? "This Meta data deletion request is still being completed." : "We could not find a deletion request with this confirmation code."}>
      <h2>Status</h2>
      {request ? (
        <p><strong>{completed ? "Completed." : "Pending."}</strong> {completed ? "The connected Instagram token, connection, automations, delivery records, webhook events, and queued payloads associated with the connected workspace were removed." : "ReplyConnect is finishing removal of queued delivery data."} Confirmation code: <code>{request.confirmationCode}</code>.</p>
      ) : (
        <p>Check the confirmation code returned by Meta and try the exact status URL again. This page does not expose Instagram account identifiers.</p>
      )}
    </PublicPage>
  );
}
