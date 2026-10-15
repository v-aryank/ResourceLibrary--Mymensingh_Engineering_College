# MEC Resource Library

MEC Resource Library is a student-focused resource portal for Mymensingh Engineering College. It is an independent resource library, not an official college website. The existing campus image, brick-wall background, typography, and architectural visual treatment are preserved.

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


## Stability and motion

- The brick texture is optimized as `public/brick-texture.webp` (the source JPG is not needed at runtime).
- The page background scrolls with the document rather than using `background-attachment: fixed`, avoiding a known mobile browser compositing issue.
- `/resources` uses client-side routing. `vercel.json` and `public/_redirects` configure SPA fallbacks for Vercel and Netlify so refreshing the library route serves the app instead of a host-level 404.
- Lenis and GSAP ScrollTrigger are progressive enhancements. Reduced-motion preferences disable them, and route/content rendering does not depend on animation.

After pulling these changes, run `npm install` to update `package-lock.json`, then `npm run build`.
