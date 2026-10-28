# Changelog

All notable changes to the HansWY File Archive project will be documented in this file.

## [2.5.0] - 2026-10-29

### Fixed
- **Admin Session Logout**: Fixed event conflict where the dropdown menu closed prematurely on `mousedown` before `click` dispatched to `handleLogout`.
- **Session Cookie Clearance**: Strengthened cookie removal in `/api/auth` with `response.cookies.delete()`, `expires: new Date(0)`, `maxAge: 0`, and explicit `SameSite=Lax; Secure` headers.
- **Client Session Sync**: Added automatic folder contents re-fetch (`fetchContents(currentFolderId, true)`) immediately upon logging out to synchronize UI permissions and clear admin buttons.

### Changed
- Updated in-app Changelog bar and notes modal to v2.5.

---

## [2.4.0] - 2026-10-29

### Added
- **Dual Theme System**: Full theme toggling between **Themes cosmic cyan on** (`[data-theme="cosmic"]`) and **Themes white on** (`[data-theme="white"]`).
- **Compact QRIS Support Template**: Streamlined and professional QRIS donation modal using official QRIS format with one-click full-screen zoom and download.

### Changed
- **English Localization**: Standardized all UI controls, navigation items, tooltips, dialogs, upload states, and error toasts to English.
- **Discord Community**: Updated Discord invite URL to `https://discord.gg/BkbchbysvZ`.

### Removed
- **Sponsor Space**: Removed obsolete banner advertisement space for a clean, distraction-free archive layout.

---

## [2.3.0] - 2026-10-28

### Added
- Autoplay animated hero banner video (`/hanswy-banner.mp4`) with smooth cosmic styling and no playback overlay button.
- HansWY Cosmic Cyan visual branding across sidebar, breadcrumbs, action cards, and modals.

---

## [2.2.0] - 2026-10-23

### Added
- Instant search filtering for folders and files in real-time.
- Responsive mobile drawer navigation with backdrop filter effects.

---

## [1.0.0] - 2026-10-14

### Added
- Initial release of HansWY File Archive on Next.js 15 & Vercel.
- Unlimited file hosting backed by GitHub Releases API (up to 2GB per asset).
- Multi-tier folder hierarchy, breadcrumb navigation, and cryptographic Scrypt admin authentication.
