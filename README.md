# MEC Student Desk

MEC Student Desk is a student-focused resource portal for Mymensingh Engineering College. It is an independent resource library, not an official college website. The existing campus image, brick-wall background, typography, and architectural visual treatment are preserved.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Configure content

- Edit the service destinations in `src/config/services.ts`. Use an empty `url` to show the unconfigured state.
- Add verified resource metadata and real file URLs in `src/data/resources.ts`. The current six entries are explicitly marked demonstrations and have no attached files.
- Update academic year and semester filter values in the same resource data file.
- Add or update clubs and laboratories in `src/data/organizations.ts`. Website, image, social, and contact fields are optional.
- Page sections and reusable controls are in `src/components/`; the resource route is in `src/pages/ResourceLibraryPage.tsx`.

## External services

The assignment cover generator and Smart Printing links point to the external services configured in `src/config/services.ts`. Student Desk does not process uploads, payments, print orders, or printer status.
