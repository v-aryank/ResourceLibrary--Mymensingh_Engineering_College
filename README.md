# MEC Resource Library

MEC Resource Library is a student-focused resource portal for Mymensingh Engineering College. It is an independent resource library, not an official college website. The existing campus image, brick-wall background, typography, and architectural visual treatment are preserved.

## Run locally

```bash
npm install
npm run dev
```

`npm run dev` starts the Vite frontend at `http://localhost:5173` and opens it
in your external browser. The API server uses port 3000 when available, or
another available port between 3000 and 3099; the `/api/*` proxy is configured
automatically. Port 5173 must be free before starting.

`npm run dev:vercel` and `npm run vercel` are the optional integrated workflow
on port 3001. `npm run dev:vite` starts only the frontend on port 5173 and
expects an API server on port 3000.

For authenticated upload flows, configure the existing Supabase and Backblaze
environment variables in `.env.local`; never put Backblaze credentials in a
`VITE_` variable.

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

## Resource uploads

The `/admin` page uses Supabase Auth and the `profiles.role = 'admin'` check.
PDFs are uploaded directly to private Backblaze B2 storage using multipart
presigned URLs; new resource records stay unpublished for review. The resource
library obtains short-lived file URLs from `/api/resource-url` and only queries
published records through Supabase RLS. Configure the existing variables
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `B2_ENDPOINT`,
`B2_BUCKET_NAME`, `B2_KEY_ID`, and `B2_APPLICATION_KEY` in local and deployment
environments. The private bucket CORS policy must allow browser `PUT` requests from the local
origins used (`http://localhost:3001` for the integrated workflow and
`http://localhost:5173` for the Vite workflow) and the production website
origin, and expose `ETag` for multipart uploads. Keep origins explicit; do not
use a wildcard. Each origin has separate browser storage, so sign in again when
switching between ports. Upload access still requires an existing admin account
with `profiles.role = 'admin'`; changing ports or CORS settings does not grant
administrator access.

For this deployment, the bucket must allow the S3 `Put Object` operation from
the exact production and local origins. The Backblaze console's “share
everything with one origin” preset has not allowed the multipart PUT in
production. Use a custom B2 CLI CORS rule instead. After authorizing the
official [B2 CLI](https://b2-command-line-tool.readthedocs.io/en/master/), run:

```bash
b2 bucket update mec-resource-library --cors-rules '[{"corsRuleName":"mecResourceUpload","allowedOrigins":["https://resourcelibrary-mec.vercel.app","http://localhost:5173","http://localhost:3001"],"allowedOperations":["s3_put"],"allowedHeaders":["content-type","x-amz-*"],"exposeHeaders":["etag"],"maxAgeSeconds":3600}]'
```

This command replaces the bucket's complete CORS rule list. If the bucket
already has rules needed for other services, first copy them and include them
alongside this rule in `--cors-rules`; do not remove rules blindly. The rule
is restricted to the production site and the two local development origins,
allows only S3 PUT uploads, and exposes only the ETag needed to complete a
multipart upload. See Backblaze's [CORS rule documentation](https://www.backblaze.com/docs/cloud-storage-cross-origin-resource-sharing-rules).

The upload API and signing request can succeed while Backblaze rejects the
browser's multipart `PUT`; that rejection is a bucket CORS configuration issue,
not a Vercel API route failure.

Before using the admin Delete control, apply
`supabase/migrations/20261020_resource_deletion_jobs.sql` in the Supabase SQL
editor. It creates admin-only retry state for safe deletion across Supabase and
Backblaze; it does not delete existing resources.

The assignment cover generator and Smart Printing links point to the external
services configured in `src/config/services.ts`.

`npm run build` checks the required Vercel API handlers and their shared
modules before compiling the frontend and API TypeScript. Keep the complete
`api/` tree in the Git commit used for a Vercel deployment; otherwise Vercel
can serve the SPA fallback for missing API routes.


## Stability and motion

- The brick texture is optimized as `public/brick-texture.webp` (the source JPG is not needed at runtime).
- The page background scrolls with the document rather than using `background-attachment: fixed`, avoiding a known mobile browser compositing issue.
- `/resources` uses client-side routing. `vercel.json` and `public/_redirects` configure SPA fallbacks for Vercel and Netlify so refreshing the library route serves the app instead of a host-level 404.
- Lenis and GSAP ScrollTrigger are progressive enhancements. Reduced-motion preferences disable them, and route/content rendering does not depend on animation.

After pulling these changes, run `npm install` to update `package-lock.json`, then `npm run build`.
