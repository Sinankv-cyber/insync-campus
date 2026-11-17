import { handle, ok } from "@/lib/api";
import { getSession } from "@/lib/auth";

export const POST = handle(async () => {
  const s = await getSession();
  s.destroy();
  return ok({ signedOut: true });
});
