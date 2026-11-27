# TERPGRID documentation

The guides in this folder are written in **German**, matching the application interface. This page lists them by topic.

Start with the documents in the first five sections. The reports at the end record how each release was built and verified.

## Installation & configuration

| Document | Content |
| --- | --- |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Requirements, host hardening, installation, configuration (`deploy/.env`), operations, key rotation, troubleshooting |
| [PRODUCTION-CHECKLIST.md](PRODUCTION-CHECKLIST.md) | Checklist before going live |
| [PHASE5-7-VPS-HARDENING.md](PHASE5-7-VPS-HARDENING.md) | Server hardening in detail |

## Administration, maintenance & upgrades

| Document | Content |
| --- | --- |
| [RUNBOOK.md](RUNBOOK.md) | Diagnosis with `status.sh`, incidents, rollback, key loss, security incidents |
| [MAINTENANCE.md](MAINTENANCE.md) | Weekly, monthly and quarterly tasks; updates; certificates; keys |
| [UPGRADE-6.0.md](UPGRADE-6.0.md) | Step-by-step upgrade to 6.0 for `/opt/terpgrid/deploy` |
| [UPGRADE-5.9.md](UPGRADE-5.9.md), [UPGRADE-5.4.md](UPGRADE-5.4.md) | Earlier upgrade guides |

## Backup & recovery

| Document | Content |
| --- | --- |
| [BACKUP.md](BACKUP.md) | restic backups, timers, restore and restore tests |
| [PHASE5-9-DISASTER-RECOVERY.md](PHASE5-9-DISASTER-RECOVERY.md) | Full disaster-recovery exercise with measurements |
| [PHASE5-7-DISASTER-RECOVERY.md](PHASE5-7-DISASTER-RECOVERY.md) | Earlier recovery exercise |

## Security & privacy

| Document | Content |
| --- | --- |
| [SECURITY.md](SECURITY.md) | Security architecture and reporting |
| [THREAT-MODEL.md](THREAT-MODEL.md) | Threat model |
| [E2EE-DECISION.md](E2EE-DECISION.md) | Why encryption is server-side, not end-to-end |
| [PHASE5-7-E2EE-FEASIBILITY.md](PHASE5-7-E2EE-FEASIBILITY.md) | Feasibility study for end-to-end encryption |
| [RELEASE-6.0-SECURITY.md](RELEASE-6.0-SECURITY.md) | Security acceptance for 6.0 |
| [PHASE5-5-ENCRYPTION.md](PHASE5-5-ENCRYPTION.md), [PHASE5-5-PERMISSION-MATRIX.md](PHASE5-5-PERMISSION-MATRIX.md) | Encryption of shared spaces; collaboration permissions |
| [PHASE5-7-OFFLINE-SECURITY.md](PHASE5-7-OFFLINE-SECURITY.md) | Security of offline data in the browser |

## Using the app

| Document | Content |
| --- | --- |
| [PHASE5-6-PWA-GUIDE.md](PHASE5-6-PWA-GUIDE.md) | Installing TERPGRID as an app on iOS, Android and desktop |
| [PHASE5-6-OFFLINE-ARCHITECTURE.md](PHASE5-6-OFFLINE-ARCHITECTURE.md) | How offline use, synchronization and logout work |
| [DEVICE-TESTING-6.0.md](DEVICE-TESTING-6.0.md) | Checklist for testing on physical devices |

## Data sources

| Document | Content |
| --- | --- |
| [CATALOG.md](CATALOG.md) | Cultivar catalog (CI-Strains-Pro), laboratory samples, enrichment, licenses, limitations |
| [PHASE5-4-DATA-INTELLIGENCE-REPORT.md](PHASE5-4-DATA-INTELLIGENCE-REPORT.md) | Source evaluation and data quality |

## Development

| Document | Content |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture (server, sync, encryption) |
| [INFORMATION-ARCHITECTURE.md](INFORMATION-ARCHITECTURE.md) | Navigation structure and overview page |
| [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | Tokens, typography, components, rules |
| [sbom/](sbom/) | Software bill of materials |

## Releases

| Document | Content |
| --- | --- |
| [../CHANGELOG.md](../CHANGELOG.md) | Changelog |
| [RELEASE-NOTES-6.0.md](RELEASE-NOTES-6.0.md) | Release notes for 6.0 (draft of the GitHub release text) |
| [RELEASE-6.0-REPORT.md](RELEASE-6.0-REPORT.md) | Release report for 6.0 |
| [RELEASE-6.0-ACCEPTANCE.md](RELEASE-6.0-ACCEPTANCE.md) | Release gates and acceptance results |
| [RELEASE-6.0-CHECKLIST.md](RELEASE-6.0-CHECKLIST.md) | Remaining gates before 6.0 is published |
| [RELEASE-6.0-KNOWN-LIMITATIONS.md](RELEASE-6.0-KNOWN-LIMITATIONS.md) | Known limitations |
| [UI-POLISH-6.0.1-REPORT.md](UI-POLISH-6.0.1-REPORT.md), [UI-POLISH-6.0.1-AUDIT.md](UI-POLISH-6.0.1-AUDIT.md) | Interface refinement in 6.0.1 |

## Development history

Each development phase has its own report. They are kept for traceability and are not needed for operation.

| Phase | Reports |
| --- | --- |
| 3–4 | [FINAL-REPORT.md](FINAL-REPORT.md), [PHASE4-REPORT.md](PHASE4-REPORT.md) |
| 5.0–5.3 | [PHASE5-REPORT.md](PHASE5-REPORT.md), [PHASE5-1-REPORT.md](PHASE5-1-REPORT.md), [ACADEMY-2-1-REPORT.md](ACADEMY-2-1-REPORT.md), [PHASE5-3-REPORT.md](PHASE5-3-REPORT.md), [PHASE5-3-REVIEW.md](PHASE5-3-REVIEW.md), [PHASE5-3-STUDIO-REPORT.md](PHASE5-3-STUDIO-REPORT.md) |
| 5.5 | [PHASE5-5-AUDIT.md](PHASE5-5-AUDIT.md), [PHASE5-5-COLLABORATION-REPORT.md](PHASE5-5-COLLABORATION-REPORT.md), [PHASE5-5-THREAT-MODEL.md](PHASE5-5-THREAT-MODEL.md) |
| 5.6 | [PHASE5-6-MOBILE-REPORT.md](PHASE5-6-MOBILE-REPORT.md), [PHASE5-6-MOBILE-THREAT-MODEL.md](PHASE5-6-MOBILE-THREAT-MODEL.md) |
| 5.7 | [PHASE5-7-SECURITY-REPORT.md](PHASE5-7-SECURITY-REPORT.md), [PHASE5-7-SECURITY-MATRIX.md](PHASE5-7-SECURITY-MATRIX.md), [PHASE5-7-ENCRYPTION-AUDIT.md](PHASE5-7-ENCRYPTION-AUDIT.md), [PHASE5-7-THREAT-MODEL.md](PHASE5-7-THREAT-MODEL.md) |
| 5.8 | [PHASE5-8-PRODUCT-REPORT.md](PHASE5-8-PRODUCT-REPORT.md), [PHASE5-8-FEATURE-MATRIX.md](PHASE5-8-FEATURE-MATRIX.md), [PHASE5-8-PERFORMANCE-REPORT.md](PHASE5-8-PERFORMANCE-REPORT.md), [PHASE5-8-REMAINING-LIMITATIONS.md](PHASE5-8-REMAINING-LIMITATIONS.md) |
| 5.9 | [PHASE5-9-PRODUCTION-REPORT.md](PHASE5-9-PRODUCTION-REPORT.md), [PHASE5-9-RELEASE-MATRIX.md](PHASE5-9-RELEASE-MATRIX.md), [PHASE5-9-BROWSER-COMPATIBILITY.md](PHASE5-9-BROWSER-COMPATIBILITY.md), [PHASE5-9-DEVICE-TESTING.md](PHASE5-9-DEVICE-TESTING.md), [PHASE5-9-PERFORMANCE.md](PHASE5-9-PERFORMANCE.md) |
