export const PERMISSIONS = [
  "learning:read:self",
  "knowledge:read",
  "analytics:read",
  "enrollment:request",
] as const;

export type Permission =
  (typeof PERMISSIONS)[number];

export type AuthenticatedActor = {
  userId: string;
  name: string;
  roles: string[];
  permissions: Permission[];
};

const DEMO_ACTOR: AuthenticatedActor = {
  userId: "user-001",
  name: "Henry",
  roles: ["learner", "manager"],
  permissions: [
    "learning:read:self",
    "knowledge:read",
    "analytics:read",
    "enrollment:request",
  ],
};

export class AuthorizationError extends Error {
  constructor(message = "You are not authorized to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function getAuthenticatedActor(): AuthenticatedActor {
  /*
   * Demo only.
   *
   * A production application would derive this identity from a
   * verified session, OAuth token, JWT, or identity provider.
   *
   * Never accept userId, roles, or permissions directly from
   * the browser request body.
   */
  return DEMO_ACTOR;
}

export function hasPermission(
  actor: AuthenticatedActor,
  permission: Permission,
): boolean {
  return actor.permissions.includes(permission);
}

export function assertPermission(
  actor: AuthenticatedActor,
  permission: Permission,
): void {
  if (!hasPermission(actor, permission)) {
    throw new AuthorizationError(
      `Missing required permission: ${permission}.`,
    );
  }
}