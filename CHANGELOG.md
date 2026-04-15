## [2.0.2](https://github.com/NoTIPswe/notip-crypto-sdk/compare/v2.0.1...v2.0.2) (2026-04-15)

## [2.0.1](https://github.com/NoTIPswe/notip-crypto-sdk/compare/v2.0.0...v2.0.1) (2026-04-12)


### Bug Fixes

* add quality gate and coverage badges to README ([da6972a](https://github.com/NoTIPswe/notip-crypto-sdk/commit/da6972a75fa3987ca4d3fa07f629f50ea11f27f3))

# [2.0.0](https://github.com/NoTIPswe/notip-crypto-sdk/compare/v1.1.2...v2.0.0) (2026-04-11)


### Bug Fixes

* update README file ([dbc841a](https://github.com/NoTIPswe/notip-crypto-sdk/commit/dbc841a74baa29d45060a2c00e515eb0b7ecadfc))


### BREAKING CHANGES

* new version

## [1.1.2](https://github.com/NoTIPswe/notip-crypto-sdk/compare/v1.1.1...v1.1.2) (2026-04-02)


### Bug Fixes

* update exports configuration in package.json for module compatibility ([45c73d7](https://github.com/NoTIPswe/notip-crypto-sdk/commit/45c73d7e4def01020c5b46cd016001fd11f9e42d))

## [1.1.1](https://github.com/NoTIPswe/notip-crypto-sdk/compare/v1.1.0...v1.1.1) (2026-04-01)


### Bug Fixes

* update API endpoints to include 'data' and 'mgmt' prefixes ([c8f9e0a](https://github.com/NoTIPswe/notip-crypto-sdk/commit/c8f9e0a69417a535beb6b80e440c3911bf28cc60))

# [1.1.0](https://github.com/NoTIPswe/notip-crypto-sdk/compare/v1.0.0...v1.1.0) (2026-04-01)


### Features

* add AbortSignal support to DataApiSseClient and DataApiService stream methods ([c3c04cd](https://github.com/NoTIPswe/notip-crypto-sdk/commit/c3c04cdf4730d4f350b79e8a5bf35e7cfa71f29b))

# 1.0.0 (2026-04-01)


### Bug Fixes

* add publishConfig to package.json to publish public package to NPM ([db870fb](https://github.com/NoTIPswe/notip-crypto-sdk/commit/db870fb399c952dae83c3d04bac686121a25c326))
* exclude CHANGELOG.md from prettier checks to allow automatic release ([7cc8f2f](https://github.com/NoTIPswe/notip-crypto-sdk/commit/7cc8f2fdaeae3f340e2f1ae1ee0c101a1e681dd1))
* move DTO validation from Service to ApiClient layer ([25c4e28](https://github.com/NoTIPswe/notip-crypto-sdk/commit/25c4e28edcb09ed9a2f1bfe28266d768b947583b))
* remove ManagementApiService export from index ([191499c](https://github.com/NoTIPswe/notip-crypto-sdk/commit/191499c46331737d915b09ba7f34c9cd39ee784e))
* remove SensorDTO and related sensor fetching methods from DataApiRestClient and DataApiService ([957a677](https://github.com/NoTIPswe/notip-crypto-sdk/commit/957a677a6f0d8b4f4f2f5941c0d2d89fef0ba054))
* update OpenAPI script to ensure temporary directory cleanup and adjust TypeScript lib settings ([0be6daf](https://github.com/NoTIPswe/notip-crypto-sdk/commit/0be6daf53143a906381aa3b8890e441562351b2f))


### Features

* add automatic Zod DTOs generation from fetched OpenAPI contracts [skip ci] ([fe566b7](https://github.com/NoTIPswe/notip-crypto-sdk/commit/fe566b784ebefdb2b94f6e54297553cb7d1e3a70))
* first implementation ([c8e311b](https://github.com/NoTIPswe/notip-crypto-sdk/commit/c8e311bf91eed4ca3c20acb8fe7616b530f23231))
