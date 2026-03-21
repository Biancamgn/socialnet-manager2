# SocialNet Manager

LBYCPG3 — Social Network Profile Manager App  
Bootstrap 5 via CDN | Supabase | Vercel Blob | Vercel

## Setup

1. Create a Supabase project and run the SQL blocks (tables, RLS, seed data)
2. Replace `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `js/app.js`
3. Create a Vercel Blob store and set `BLOB_READ_WRITE_TOKEN` as environment variable
4. After batch uploading avatars, update `DEFAULT_AVATAR` in `js/app.js`
5. Push to GitHub and deploy via Vercel
