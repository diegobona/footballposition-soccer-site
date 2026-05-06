# CMS R2 image upload Worker

This Worker receives pasted image uploads from Decap CMS and stores them in Cloudflare R2.

## Required Cloudflare settings

- Worker custom domain: `https://cms-upload.footballposition.soccer`
- R2 bucket binding: `MEDIA_BUCKET` -> `footballposition-media`
- Public R2 image domain: `https://media.footballposition.soccer`

## Dashboard deployment

If you are editing the Worker in the Cloudflare dashboard, paste `cms-upload-worker.mjs` as the Worker code and set these variables:

- `MEDIA_PUBLIC_BASE_URL`: `https://media.footballposition.soccer`
- `GITHUB_REPO`: `diegobona/footballposition-soccer-site`
- `ALLOWED_ORIGINS`: `https://footballposition.soccer,http://localhost:1313`
- `MEDIA_OBJECT_FOLDER`: `uploads`
- `MAX_UPLOAD_BYTES`: `10485760`

The CMS frontend sends the existing Decap GitHub OAuth token in the `Authorization` header. The Worker verifies that token against the configured GitHub repo before writing to R2, so the R2 secret is not exposed in browser JavaScript.
