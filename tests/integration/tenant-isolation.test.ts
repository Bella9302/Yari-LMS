import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getUserDetail, inviteUser, listUsers, PermissionError } from "@/server/pii/users";
import { createOrg, createUser } from "../support/factories";

let orgA: { id: string };
let orgB: { id: string };
let managerA: Awaited<ReturnType<typeof createUser>>;
let admin: Awaited<ReturnType<typeof createUser>>;
let staffA: Awaited<ReturnType<typeof createUser>>;
let staffB: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
  orgA = await createOrg("Acme Mining");
  orgB = await createOrg("Beta Construction");
  admin = await createUser({ roles: [{ role: "SUPER_ADMIN" }] });
  managerA = await createUser({ roles: [{ role: "CLIENT_MANAGER", organizationId: orgA.id }] });
  staffA = await createUser({ roles: [{ role: "LEARNER" }], memberOf: [orgA.id], idNumber: "8001015009087" });
  staffB = await createUser({ roles: [{ role: "LEARNER" }], memberOf: [orgB.id] });
});

describe("client company isolation", () => {
  it("a client manager only lists their own company's staff", async () => {
    const rows = await listUsers(managerA, { organizationId: orgA.id });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(staffA.id);
    expect(ids).not.toContain(staffB.id);
  });

  it("refuses to list another company's staff", async () => {
    await expect(listUsers(managerA, { organizationId: orgB.id })).rejects.toThrow(PermissionError);
  });

  it("without an explicit company, scopes to managed companies", async () => {
    const ids = (await listUsers(managerA)).map((r) => r.id);
    expect(ids).toContain(staffA.id);
    expect(ids).not.toContain(staffB.id);
    expect(ids).not.toContain(admin.id);
  });

  it("returns nothing (not forbidden) for another company's person, so existence isn't revealed", async () => {
    expect(await getUserDetail(managerA, staffB.id)).toBeNull();
    expect(await getUserDetail(managerA, admin.id)).toBeNull();
  });

  it("can't invite into another company", async () => {
    await expect(
      inviteUser(managerA, {
        email: "x@example.co.za",
        fullName: "X Person",
        role: "LEARNER",
        organizationId: orgB.id,
      }),
    ).rejects.toThrow(PermissionError);
  });

  it("learners can't list anyone", async () => {
    await expect(listUsers(staffA)).rejects.toThrow(PermissionError);
  });
});

describe("ID number masking", () => {
  it("masks the ID for a client manager", async () => {
    const detail = await getUserDetail(managerA, staffA.id);
    expect(detail?.idNumber).toBe("*********9087");
    expect(detail?.idNumberMasked).toBe(true);
  });

  it("masks the ID for the learner themself", async () => {
    expect((await getUserDetail(staffA, staffA.id))?.idNumber).toBe("*********9087");
  });

  it("shows the full ID to a super admin", async () => {
    const detail = await getUserDetail(admin, staffA.id);
    expect(detail?.idNumber).toBe("8001015009087");
    expect(detail?.idNumberMasked).toBe(false);
  });
});

describe("personal data at rest", () => {
  it("stores no plaintext email, name or ID", async () => {
    const [row] = await db.$queryRaw<{ data: string }[]>`
      SELECT row_to_json(u)::text || row_to_json(p)::text AS data
      FROM "User" u JOIN "UserProfile" p ON p."userId" = u.id WHERE u.id = ${staffA.id}`;
    expect(row!.data).not.toContain(staffA.email);
    expect(row!.data).not.toContain(staffA.fullName);
    expect(row!.data).not.toContain("8001015009087");
  });
});
