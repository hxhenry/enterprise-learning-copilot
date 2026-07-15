import { describe, expect, it } from "vitest";

import {
  assertPermission,
  AuthorizationError,
  getAuthenticatedActor,
  hasPermission,
} from "@/lib/security/authorization";

describe("authorization", () => {
  it("returns the server-controlled demo actor", () => {
    const actor = getAuthenticatedActor();

    expect(actor).toMatchObject({
      userId: "user-001",
      name: "Henry",
    });
  });

  it("recognizes an assigned permission", () => {
    const actor = getAuthenticatedActor();

    expect(
      hasPermission(
        actor,
        "enrollment:request",
      ),
    ).toBe(true);
  });

  it("throws when the actor lacks permission", () => {
    const actor = {
      userId: "user-without-write-access",
      name: "Read Only User",
      roles: ["learner"],
      permissions: [
        "learning:read:self" as const,
      ],
    };

    expect(() =>
      assertPermission(
        actor,
        "enrollment:request",
      ),
    ).toThrow(AuthorizationError);
  });
});