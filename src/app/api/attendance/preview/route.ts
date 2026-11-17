import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { resolveJoin } from "@/lib/attendance";

export const GET = handle(async (req: Request) => {
  const u = await requireUser("student");
  const r = await resolveJoin(u, new URL(req.url).searchParams.get("code") || "");
  return ok({ className: r.session.class_name, subjectCode: r.session.subject_code, teacherName: r.session.teacher_name, openedAt: r.session.opened_at, expiresAt: r.expiresAt, existing: r.existing });
});
