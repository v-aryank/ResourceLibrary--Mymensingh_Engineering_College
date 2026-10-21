import { access } from 'node:fs/promises';

const requiredFiles = [
  'api/resource-thumbnails.ts',
  'api/resource-url.ts',
  'api/resources/delete.ts',
  'api/storage-health.ts',
  'api/uploads/abort.ts',
  'api/uploads/complete.ts',
  'api/uploads/create.ts',
  'api/uploads/save-thumbnail.ts',
  'api/uploads/sign-part.ts',
  'api/uploads/thumbnail-url.ts',
  'api/_lib/admin.ts',
  'api/_lib/storage.ts',
  'api/_lib/upload-validation.ts',
];

const missing = [];
for (const file of requiredFiles) {
  try {
    await access(new URL(`../${file}`, import.meta.url));
  } catch {
    missing.push(file);
  }
}

if (missing.length > 0) {
  console.error(
    `Vercel deployment is missing required API source files:\n${missing.map((file) => `  - ${file}`).join('\n')}\nInclude the complete API tree in the deployment source and retry.`,
  );
  process.exitCode = 1;
} else {
  console.log(`Verified ${requiredFiles.length} required Vercel API and shared files.`);
}
