# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Security
- Content Security Policy (CSP) headers added to frontend and mobile HTML files
- CSV injection protection in ExportPage with `sanitizeCSV()` function
- Security warning documentation for legacy SSL/TLS configuration in crawler
- `.env.example` templates for secure onboarding
- `detect-secrets` pre-commit hook to prevent credential leaks

#### Testing Infrastructure
- Jest + React Testing Library configured for frontend testing
- Test scripts added: `npm test`, `npm run test:watch`, `npm run test:coverage`
- Sample test files created:
  - `ExportPage.test.ts` - Tests CSV sanitization security feature
  - `format.test.ts` - Tests utility functions
  - `accessibility.test.tsx` - Tests component accessibility with jest-axe
- Jest setup file with mocks for matchMedia, IntersectionObserver, ResizeObserver
- jest-axe integration for automated accessibility testing

#### CI/CD
- GitHub Actions CI pipeline (`.github/workflows/ci.yml`)
  - Frontend tests (Node 18.x & 20.x)
  - Frontend build verification
  - Python tests (3.9, 3.10, 3.11)
  - API tests
  - Coverage reporting
- Pre-commit hooks configured (`.pre-commit-config.yaml`)
  - Trailing whitespace removal
  - End-of-file fixing
  - Black (Python formatting)
  - Flake8 (Python linting)
  - Bandit (Python security)
  - ESLint (Frontend linting)
  - Prettier (Frontend formatting)
  - Secrets detection
  - Branch protection (prevents commits to main)

#### Code Quality
- ESLint configuration with TypeScript and React hooks rules
- Prettier configuration with consistent formatting
- Lint scripts: `npm run lint`, `npm run lint:fix`
- Format scripts: `npm run format`, `npm run format:check`
- Prettier ignore file for build artifacts

#### Documentation
- `CONTRIBUTING.md` with complete development setup and contribution guidelines
- `ARCHITECTURE.md` with system architecture overview and data flow diagrams
- `API.md` with complete API reference and examples
- `CHANGELOG.md` (this file) for version history

#### Accessibility
- ARIA labels added to all interactive elements:
  - FundCard remove button
  - FundSelector search input with combobox role
  - Fund dropdown with listbox role
  - Tab navigation with tablist, tab, and tabpanel roles
  - GitHub login button
  - Portfolio save/sign out buttons
- GitHub icon marked as `aria-hidden` and `focusable="false"`
- Tab panels wrapped with proper `role="tabpanel"` attributes

### Changed

#### Version Consistency
- Synchronized version numbers across all files (0.1.0 → 0.5.0)
  - `tefas/__init__.py`
  - `setup.py`
  - `pyproject.toml`

#### Code Quality Improvements
- Renamed `STATIC_CHECKER_HACK` to `STATIC_CHECKER_WORKAROUND` with better documentation
- Disabled CLI entry points (commented out) until CLI module is implemented
- Fixed invalid CSS in mobile frontend (extra closing brace)

### Fixed

#### Security Issues
- **CRITICAL**: Updated all environment files to new Supabase project (`hirpfdwsnzqgzdfyxriv`)
- **HIGH**: Added CSP headers to prevent XSS attacks
- **MEDIUM**: Fixed CSV injection vulnerability in ExportPage
- **MEDIUM**: Documented SSL legacy connection security trade-off

#### Code Issues
- Fixed CSS nesting issue in `frontend-mobile/src/styles.css`

## [0.5.0] - 2024-01-15

### Added
- Initial release of TEFAS Fund Dashboard
- Multi-fund comparison (up to 5 funds)
- Interactive charts with time period selection (1D to 5Y)
- Price, Market Cap, and Investor Count metrics
- Fund types: YAT, EMK, BYF
- GitHub authentication for portfolio saving
- Technical indicators (MA50, MA200)
- Fund screening and technical scanning
- Data export (CSV, Excel, PDF)
- Mobile-responsive design

### Technical
- React 18 + TypeScript frontend
- Vite build tool
- Recharts for charting
- Supabase (PostgreSQL) backend
- Python TEFAS crawler
- Vercel deployment

---

## Versioning Guide

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0): Breaking changes that require user intervention
- **MINOR** (0.X.0): New features, backwards compatible
- **PATCH** (0.0.X): Bug fixes, backwards compatible

## Categories

- **Added**: New features
- **Changed**: Changes to existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security improvements

## Release Schedule

We aim to release:

- **Patch releases**: As needed for critical bug fixes
- **Minor releases**: Monthly with new features
- **Major releases**: Quarterly with breaking changes

---

## Migration Guides

### Upgrading to 0.6.0

When released, this section will contain migration instructions.

### Upgrading to 1.0.0

When released, this section will contain migration instructions for the first stable release.
