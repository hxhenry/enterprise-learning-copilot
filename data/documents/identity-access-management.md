# Identity and Access Management

## Authentication and Authorization

Authentication verifies who a user or system is.

Examples of authentication include passwords, passkeys, security keys,
one-time codes, and biometric verification.

Authorization determines what an authenticated identity is allowed to
access or perform.

For example, signing in to an employee portal is authentication.
Receiving permission to view payroll reports is authorization.

## Least Privilege

Least privilege means granting only the access required to perform a
specific responsibility.

Access should be limited by:

- Resource
- Action
- Environment
- Time
- Business role

Permissions should be reviewed regularly and removed when they are no
longer required.

## Role-Based Access Control

Role-Based Access Control, or RBAC, assigns permissions to roles rather
than assigning every permission directly to individual users.

For example:

- Learners can view courses and submit assessments.
- Managers can view team completion statistics.
- Certification administrators can manage certification requirements.
- Platform administrators can configure system-level settings.

A user may receive one or more roles depending on business
responsibilities.

## Multi-Factor Authentication

Multi-factor authentication requires evidence from more than one
authentication category.

Common categories include:

- Something the user knows
- Something the user has
- Something the user is

MFA should be required for administrative access and other high-risk
operations.

## Service Identities

Applications and automated workloads should use service identities
rather than shared human credentials.

Service credentials should:

- Be scoped to the required resources
- Be rotated regularly
- Be stored in a secret-management system
- Never be committed to source control
- Be monitored for unusual usage