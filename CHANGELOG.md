# Changelog

All notable changes to the HansWY File Archive project will be documented in this file.

## [3.6.0] - 2026-10-31

### Added
- **Video Streaming & Player**: An optional video player is now available for both Guest and Admin users. Play video tutorials (`.mp4`, `.webm`, `.ogg`, `.mov`) directly in the browser without downloading.
- **Integrated Video Modal**: A dedicated player interface with playback controls, responsive scaling, and a direct download shortcut.

### Fixed
- **Zero-Bandwidth Playback**: Video playback streams directly from GitHub CDN via our 302 redirect engine, ensuring 0 bytes of Vercel bandwidth usage.

### Changed
- Updated in-app Changelog bar and release notes modal to v3.6.

---

## [3.5.0] - 2026-10-30

### Added
- **Multi-Select Mode**: A select toggle (available to both Guest and Admin) lets users pick multiple files at once.
- **Bulk Copy Links**: Copy the direct download links of every selected file to the clipboard in one action.
- **Bulk Download**: Trigger the download of all selected files with a single click.
- **Bulk Delete (Admin)**: Admins can delete many files at once with one confirmation, instead of deleting them one by one.
- **Auto-Merge Engine**: Large files uploaded in parts are now automatically merged into single assets on GitHub, allowing direct downloads for all future uploads.

### Fixed
- **Zero-Bandwidth & GitHub Delivery**: All downloads (single and bulk) now resolve to GitHub CDN via 302 redirects. This ensures 0 bytes of Vercel bandwidth are consumed, keeping the "Fast Origin Transfer" quota safe.
- **Corrected Release Time**: Fixed the v3.5 release time in the UI from 04:45 to 20:45 WIB.

### Changed
- Updated in-app Changelog bar and release notes modal to v3.5.

---

## [3.4.0] - 2026-10-30

### Fixed
- **Full GitHub Direct-Delivery**: Re-consolidated every large APK that was previously stored in parts (chunked) into a single asset on GitHub Releases. All 30 files now serve through a lightweight 302 redirect straight to GitHub's CDN instead of being re-merged through the serverless function.
- **Zero Vercel Bandwidth**: APK payloads no longer pass through Vercel at all, so "Fast Origin Transfer" usage is 0 bytes per download. The Vercel quota can no longer be overlimited by file downloads.

### Changed
- Download button and "Copy Direct Link" now always resolve to GitHub for every file.
- Updated in-app Changelog bar and release notes modal to v3.4.

---

## [3.3.0] - 2026-10-29

### Added
- **Zero-Bandwidth Frontend Optimization**: Updated `handleDownloadFile` and `copyDirectLink` to use direct GitHub Release CDN URLs whenever possible. This completely bypasses Vercel's edge network for single public files, ensuring 0 bytes of "Fast Origin Transfer" quota are used.
- **Improved Vercel Quota Safety**: By prioritizing direct GitHub downloads in the browser, the website is now significantly safer from Vercel bandwidth overlimits.
- **Smart Download Fallback**: The system intelligently switches between direct GitHub CDN links (for speed and quota safety) and API-based streaming (for fragmented or admin-only files) without user intervention.

### Changed
- Updated in-app Changelog bar and release notes modal to v3.3.
- Optimized link generation logic to prioritize external CDN endpoints over serverless proxies.

---

## [3.2.0] - 2026-10-29

### Added
- **Streaming Merge Engine for Chunked Files**: Implemented a new server-side streaming merger that real-time reconstructs large files split into parts (chunks) on GitHub. This fixes 404 errors for large APK downloads and eliminates the need for manual file re-assembly.
- **Catch-all API Download Routes**: Upgraded the download endpoint to `[...path]` catch-all routing. Direct links now end with the actual filename (e.g., `/api/download/ID/Roblox.apk`), ensuring 100% native compatibility with automated installers like Executor Installer and Redfinger.
- **Intelligent Download Routing**: The system now automatically detects file fragmentation and chooses between a fast 302 CDN redirect (for single assets) or a streaming merge (for chunked files) to provide a seamless user experience.

### Changed
- Updated in-app Changelog bar and release notes modal to v3.2.
- Updated "Copy Direct Link" logic to provide stable, API-backed URLs that work for both standard and fragmented files.

---

## [3.1.0] - 2026-10-29

### Added
- **Permanent Zero-Bandwidth Direct CDN Architecture**: Upgraded download architecture so that all files are served directly from GitHub's unlimited global release CDN (`release-assets.githubusercontent.com`). This ensures 0 bytes of Vercel bandwidth quota are consumed when users or automated devices download large APKs.
- **Direct CDN Link Generation**: `copyDirectLink` now provides direct GitHub Release CDN download links (ending with `.apk` asset names), guaranteeing that external batch installers like Executor Installer and Redfinger download with maximum speed and zero dependency on Vercel bandwidth.
- **Fast 302 Serverless Redirect**: The `/api/download/:id` endpoint now issues a lightweight HTTP 302 header redirect rather than proxying heavy binary streams through Vercel serverless functions, protecting the account from Fast Origin Transfer limits.
- **Single-Asset Cloud Migration**: Re-assembled all chunked file parts on GitHub Release storage into single direct-download release assets.

### Changed
- Updated in-app Changelog bar and release notes modal to v3.1.

---

## [3.0.0] - 2026-10-29

### Added
- **New Cinematic Pixel Banner**: Updated the hero banner video with the latest animated HansWY pixel artwork featuring smooth motion and high quality.
- **Banner Audio Control**: Added an interactive Mute/Unmute audio button directly on the banner card, allowing users to listen to the soundtrack or keep it muted with responsive visual pulse indicator.

### Changed
- Updated in-app Changelog bar and release notes modal to v3.0.

---

## [2.9.0] - 2026-10-29

### Added
- **Admin Hide/Show Controls**: Added dedicated visibility toggle (Eye/Eye-Off button) for administrators on every folder and file.
- **Guest Protection & Staging**: Hidden folders and files are completely filtered out from guest users' view and denied on the download endpoint (`HTTP 403`), allowing administrators to upload, test, and verify files before releasing them publicly.
- **Admin Visibility Indicators**: Hidden items are visually highlighted in the admin view with a dashed border and an amber `HIDDEN` badge.

### Changed
- Updated in-app Changelog bar and release notes modal to v2.9.

---

## [2.8.0] - 2026-10-29

### Fixed
- **Remote / Executor Installer Compatibility**: Fixed APK installation failure when using direct links in remote installers (Executor Installer, Redfinger, bot automation). The server now streams raw `.apk` payloads directly with `application/vnd.android.package-archive` MIME type and CORS headers instead of 302 redirects.
- **Direct APK URL Endpoint**: `copyDirectLink` now generates direct download API URLs with file extension parameters (e.g. `https://file-hanswy.vercel.app/api/download/[id]?file=example.apk`) so automated installers recognize the file as an installable APK rather than a web page.

### Changed
- Updated in-app Changelog bar and release notes modal to v2.8.

---

## [2.7.0] - 2026-10-29

### Fixed
- **Download Blocking (`about:blank#blocked`)**: Resolved cross-origin link blockage in modern Chromium/Firefox browsers when downloading files. Both single file and chunked downloads now consistently route through `/api/download/[id]` server-side endpoint with clean attachments and content disposition headers.
- **Auto-Download Link Trigger**: Fixed `?download=<id>` deep link query parameter to trigger programmatic downloads cleanly without opening blocked blank navigation tabs.

### Added
- **Visual Feedback Animations**: Added smooth green flash feedback on file/folder rename and graceful fade-out transition on deletion.

### Changed
- Updated in-app Changelog bar and notes modal to v2.7.

---

## [2.6.0] - 2026-10-29

### Added
- **Rename/Edit Animation**: Items flash with a green highlight when successfully renamed, providing clear visual feedback.
- **Delete Animation**: Items fade out smoothly before being removed from the list, eliminating user confusion.

### Changed
- Updated in-app Changelog bar and notes modal to v2.6.

---

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

