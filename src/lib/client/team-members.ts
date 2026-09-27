"use client";

import { useEffect, useState } from "react";

export type TeamMember = { userId: string; email: string; role: string };

// One request per session: the member list rarely changes and both the
// Contacts table (owner names) and the contact drawer (assignee picker) need it.
let membersRequest: Promise<TeamMember[]> | undefined;
let membersFetcher: typeof fetch | undefined;

export function loadTeamMembers(): Promise<TeamMember[]> {
  if (!membersRequest || membersFetcher !== fetch) {
    membersFetcher = fetch;
    membersRequest = fetch("/api/team/members")
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { data?: TeamMember[] };
        return response.ok && Array.isArray(payload.data) ? payload.data : [];
      })
      .catch(() => {
        membersRequest = undefined;
        return [];
      });
  }
  return membersRequest;
}

/** Workspace members keyed by userId -> email. Empty until loaded. */
export function useTeamMembers(): Map<string, string> {
  const [members, setMembers] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let active = true;
    void loadTeamMembers().then((list) => {
      if (active) setMembers(new Map(list.map((member) => [member.userId, member.email])));
    });
    return () => { active = false; };
  }, []);
  return members;
}
