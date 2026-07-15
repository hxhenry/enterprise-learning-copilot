# Cloud Security Fundamentals

## Shared Responsibility Model

Cloud security responsibility is divided between the cloud provider and
the customer.

The cloud provider is generally responsible for security of the cloud,
including the physical facilities, physical hardware, and foundational
cloud infrastructure.

The customer is responsible for security in the cloud. Customer
responsibilities commonly include identity configuration, application
security, data classification, encryption settings, network rules, and
access control.

The exact division of responsibility depends on whether the customer is
using Infrastructure as a Service, Platform as a Service, or Software as
a Service.

## Data Protection

Sensitive information should be encrypted both at rest and in transit.

Encryption at rest protects stored data such as database records,
backups, and files. Encryption in transit protects data moving between
users, applications, APIs, and services.

Encryption keys should be protected separately from encrypted data.
Access to keys should follow least-privilege principles and should be
audited.

## Network Security

Cloud networks should use segmentation to limit unnecessary
communication between applications and services.

Security groups, firewall rules, and network policies should permit only
the required traffic. Public access should be disabled unless there is a
documented business requirement.

Sensitive workloads should be placed in private network segments.

## Logging and Monitoring

Security-relevant events should be logged centrally.

Important events include:

- Authentication failures
- Privilege changes
- Network configuration changes
- Sensitive data access
- Key-management operations
- Security-policy modifications

Alerts should be configured for unusual or high-risk activity.

## Incident Response

A cloud incident-response plan should define:

1. How an incident is detected
2. Who must be notified
3. How affected systems are isolated
4. How evidence is preserved
5. How systems are recovered
6. How lessons learned are documented

Incident-response exercises should be performed regularly.