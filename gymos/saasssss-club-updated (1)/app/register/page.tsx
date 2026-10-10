import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isTenantHost } from "@/lib/host";

export default async function RegisterPage() {
  const host = (await headers()).get("host") ?? "localhost";
  redirect(isTenantHost(host) ? "/user/register" : "/onboarding");
}