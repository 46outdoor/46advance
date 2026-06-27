# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Password reset:** a forgot-password screen and public `/forgot-password` route, linked from the sign-in screen, that sends a reset email without revealing whether an account exists.

### Changed

- **Theme specimen:** the `/__theme` design-specimen route is now dev-only and no longer ships in production builds.
