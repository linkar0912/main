import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { buildInboxContacts } from "@/src/lib/inbox";
import { MetaClient } from "@/src/lib/meta/client";
import { resolveInstagramUsernames } from "@/src/lib/meta/username-resolver";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

const CONTACT_LIMIT = 500;
const EVENT_LIMIT = 1_000;

// GET /api/inbox - the conversation roster is contact-first. A person remains
// visible even when their latest webhook has aged out of the activity log.
export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const repository = getRepository();
  const [contacts, events] = await Promise.all([
    repository.listContactsByLeadStatus(session.workspaceId, { limit: CONTACT_LIMIT }),
    repository.listRecentWebhookEvents(session.workspaceId, EVENT_LIMIT),
  ]);
  const env = getServerEnv();
  const connections = env.metaTokenEncryptionKey && contacts.length
    ? await repository.listConnections(session.workspaceId)
    : [];
  const usernames = await resolveInstagramUsernames({
    identities: contacts,
    events,
    connections,
    ...(env.metaTokenEncryptionKey ? {
      client: new MetaClient({ apiVersion: env.metaApiVersion }),
      tokenEncryptionKey: env.metaTokenEncryptionKey,
    } : {}),
  });

  return NextResponse.json({ data: { contacts: buildInboxContacts(contacts, events, usernames) } });
}
