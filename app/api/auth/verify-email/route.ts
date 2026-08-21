import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { getRepository } from "@/src/lib/repository-provider";
import { consumeAuthToken } from "@/src/lib/auth/tokens";

export const runtime = "nodejs";

export async function GET(request: Request) {
    const env = getServerEnv();
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const consumed = await consumeAuthToken(token, "EMAIL_VERIFY");
    if (!consumed) return NextResponse.redirect(new URL("/login?verify=invalid", env.appUrl), 303);
    await getRepository().markUserEmailVerified(consumed.userId);
    return NextResponse.redirect(new URL("/automations?verified=1", env.appUrl), 303);
}