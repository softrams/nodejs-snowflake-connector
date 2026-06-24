# Changelog

All notable changes to this project will be documented in this file.

## [3.0.0] - 2026-06-23

### Breaking Changes

- **Replaced `aws-sdk` v2 with `@aws-sdk/client-secrets-manager` v3.** Consumers using `aws-sdk` as a peer dependency must switch to `@aws-sdk/client-secrets-manager`.
- **Upgraded `snowflake-sdk` from `^2.0.3` to `^3.0.0`.** Snowflake SDK 3.0.0 dropped official Node.js 18 support.
- **Minimum Node.js version raised to 20.** Previously `>=14.0.0`, now `>=20.0.0` (required by both `snowflake-sdk` 3.0.0 and `@aws-sdk` v3).

### Added

- Version logging on `init()` — logs `Snowflake Adapter: nodejs-snowflake-connector v<version> initialized` to help verify deployed version.

### Migration Guide (2.x → 3.0.0)

1. **Update Node.js** to 20.x or later.
2. **Replace the AWS SDK peer dependency:**
   ```bash
   npm uninstall aws-sdk
   npm install @aws-sdk/client-secrets-manager
   ```
3. **Update the connector:**
   ```bash
   npm install @softrams/nodejs-snowflake-connector@^3.0.0
   ```
4. **No code changes required** — the connector's public API (`init`, `execute`, `connect`, `createSnowPool`, `closePool`, `closeAllPools`) is unchanged.

## [2.0.0] - 2024-10-01

### Added

- AWS Secrets Manager integration for private key retrieval
- Key pair (JWT) authentication support
- Connection pooling with configurable min/max
- Configuration validation with descriptive error messages
- Support for multiple data sources
