import { headers } from "next/headers";
import Workbench from "./workbench";

export const dynamic = "force-dynamic";

export default async function WorkbenchPage() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName = encodedFullName
    && requestHeaders.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8"
    ? decodeURIComponent(encodedFullName)
    : null;

  return <Workbench viewer={fullName ?? email} />;
}
