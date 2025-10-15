# 🚀 Deployment Guide for Reverie

This guide walks you through deploying your AI-powered music analysis tool to Cloudflare.

## Prerequisites

- [ ] Cloudflare account
- [ ] Node.js 18+ installed
- [ ] Git repository set up
- [ ] All dependencies installed (`npm install`)

## Step 1: Cloudflare Setup

### 1.1 Login to Cloudflare
```bash
npx wrangler login
```
Follow the browser authentication flow.

### 1.2 Create R2 Bucket
```bash
npx wrangler r2 bucket create reverie-r2
```

### 1.3 Create KV Namespace
```bash
npx wrangler kv:namespace create CACHE
```

**Important**: Copy the namespace ID from the output and update `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "CACHE"
id = "YOUR_NAMESPACE_ID_HERE"  # Replace this
```

## Step 2: Verify Configuration

Check that `wrangler.toml` contains:
- ✅ Correct bucket name: `reverie-r2`
- ✅ KV namespace ID (from step 1.3)
- ✅ Durable Objects migration
- ✅ AI binding enabled

## Step 3: Test Locally

```bash
npm run check  # TypeScript validation
npm run dev    # Local development server
```

Visit `http://localhost:8787` to test the application.

## Step 4: Deploy

```bash
npm run deploy
```

This will:
- Deploy your Worker to Cloudflare
- Upload static files to Pages
- Set up Durable Objects
- Configure all bindings

## Step 5: Verify Deployment

1. Check the deployment URL provided by Wrangler
2. Test the `/api/health` endpoint
3. Try uploading an MP3 file
4. Test the AI chat functionality

## Step 6: Production Libraries

### Replace Placeholder Files

The `pages/public/libs/` directory contains placeholder files. For production, download and replace with:

1. **OpenSheetMusicDisplay**
   ```bash
   curl -o pages/public/libs/opensheetmusicdisplay.min.js \
     https://github.com/opensheetmusicdisplay/opensheetmusicdisplay/releases/download/v1.8.7/opensheetmusicdisplay.min.js
   ```

2. **Essentia.js**
   ```bash
   # Download from: https://github.com/MTG/essentia.js/releases
   ```

3. **VexFlow**
   ```bash
   curl -o pages/public/libs/vexflow.min.js \
     https://unpkg.com/vexflow@4.2.2/build/vexflow.min.js
   ```

4. **Tonal.js**
   ```bash
   curl -o pages/public/libs/tonal.min.js \
     https://unpkg.com/tonal@4.6.5/build/tonal.min.js
   ```

### Redeploy After Library Updates
```bash
npm run deploy
```

## Environment Variables

Set any additional environment variables in the Cloudflare dashboard:
- `APP_NAME`: Application name (already set in wrangler.toml)
- Any other custom variables your app needs

## Monitoring

### Check Logs
```bash
npx wrangler tail
```

### Monitor Usage
- Cloudflare Dashboard → Workers & Pages
- Monitor R2 storage usage
- Check KV operations
- Review AI model usage

## Troubleshooting

### Common Issues

1. **KV Namespace Not Found**
   - Verify the namespace ID in wrangler.toml
   - Ensure the namespace was created successfully

2. **R2 Bucket Access Denied**
   - Check bucket name matches wrangler.toml
   - Verify bucket was created successfully

3. **AI Model Errors**
   - Check Workers AI is enabled on your account
   - Verify the model name is correct
   - Check your AI usage limits

4. **Durable Objects Not Working**
   - Ensure migration is properly configured
   - Check class names match between files and wrangler.toml

### Debug Commands

```bash
# Check configuration
npx wrangler whoami

# List resources
npx wrangler r2 bucket list
npx wrangler kv:namespace list

# View deployment logs
npx wrangler tail --format=pretty
```

## Scaling Considerations

- **R2 Storage**: Monitor usage and set up lifecycle rules
- **KV Cache**: Consider TTL values for cached data
- **Durable Objects**: Monitor memory usage per session
- **AI Usage**: Set up usage alerts and limits

## Security

- Enable CORS appropriately for your use case
- Validate file uploads (size, type, content)
- Implement rate limiting if needed
- Consider authentication for production use

## Next Steps

1. Set up custom domain (optional)
2. Configure monitoring and alerts
3. Implement user authentication
4. Add error tracking (e.g., Sentry)
5. Set up CI/CD pipeline

---

**Need Help?**
- Check the [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/)
- Review the [Hono documentation](https://hono.dev/)
- Consult the project README.md for additional context
