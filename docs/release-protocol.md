# SandPro OMP Release Protocol

Production changes must use the gated deploy command:

```bash
npm run deploy:prod
```

That command:

1. Pulls current Vercel production settings.
2. Runs lint, unit tests, live schema validation, production build, PWA checks, and accessibility smoke.
3. Deploys the full Vercel project to production, including API functions.
5. Runs read-only production smoke tests after deploy.

If a feature needs new tables, columns, storage buckets, or policies, run this first:

```bash
npm run db:migrate:release
```

Do not use `vercel deploy --prod` directly for customer-facing releases. That bypasses the schema gate that prevents frontend features from shipping before the production database is ready.
