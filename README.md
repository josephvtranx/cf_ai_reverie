#  Reverie - AI Music Analysis Tool

**Reverie** is an AI-powered music web application built on Cloudflare Workers that analyzes MP3 files, extracts musical notes, renders sheet music, and provides interactive AI-powered music assistance.

##  Features

- ** MP3 Upload & Analysis**: Upload MP3 files and extract musical notes using WebAssembly audio processing
- ** Sheet Music Rendering**: Generate and display MusicXML sheet music in real-time
- ** AI Chat Interface**: Chat with Llama 3.1 AI model about your music (key, difficulty, structure)
- ** Music Transposition**: Request AI-powered or deterministic transpositions
- ** Persistent Sessions**: Per-user memory and state management with Durable Objects
- ** Cloud Storage**: Store generated MusicXML files and summaries in R2

## Architecture

### Frontend
- **Cloudflare Pages** with vanilla JavaScript
- **OpenSheetMusicDisplay** for sheet music rendering
- **WebAssembly** libraries for audio processing (Essentia.js, CREPE-WASM)

### Backend
- **Cloudflare Workers** with Hono framework
- **Durable Objects** for session state management
- **R2 Bucket** for file storage
- **KV Store** for caching
- **Workers AI** with Llama 3.1 for music analysis

##  Quick Start

### Prerequisites
- Node.js 18+
- Cloudflare account
- Wrangler CLI

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <your-repo>
   cd cf_ai_reverie
   npm install
   ```

2. **Set up Cloudflare resources:**
   ```bash
   npx wrangler login
   npx wrangler r2 bucket create reverie-r2
   npx wrangler kv:namespace create CACHE
   ```

3. **Update wrangler.toml** with the KV namespace ID from step 2

4. **Run locally:**
   ```bash
   npm run dev
   ```

5. **Deploy to Cloudflare:**
   ```bash
   npm run deploy
   ```

## 📁 Project Structure

```
cf_ai_reverie/
├── workers/
│   ├── index.ts          # Main Hono app with API routes
│   ├── do_session.ts     # Durable Object for session state
│   └── score.ts          # MusicXML transposition logic
├── pages/public/
│   ├── index.html        # Main UI
│   ├── app.js           # Frontend logic
│   ├── styles.css       # Styling
│   └── libs/            # WASM libraries (placeholder)
├── workflows/
│   └── audio-pipeline.yaml
├── wrangler.toml        # Cloudflare configuration
├── package.json
└── tsconfig.json
```

## 🛠️ Development

### Available Scripts
- `npm run dev` - Start local development server
- `npm run check` - TypeScript type checking
- `npm run deploy` - Deploy to Cloudflare
- `npm run build` - Build TypeScript

### API Endpoints

- `POST /api/session` - Create new user session
- `POST /api/chat/:sessionId` - Chat with AI about music
- `POST /api/transpose` - Transpose MusicXML
- `POST /api/save/:sessionId` - Save generated files
- `PUT /api/upload/:sessionId` - Upload MP3 files

### Environment Variables

Configure in `wrangler.toml`:
- `APP_NAME` - Application name
- AI binding for Workers AI
- R2 bucket for file storage
- KV namespace for caching
- Durable Objects for sessions

## 🎼 Usage

1. **Upload MP3**: Select an MP3 file and click "Analyze"
2. **View Sheet Music**: Generated MusicXML renders as sheet music
3. **Chat with AI**: Ask questions like:
   - "What key is this in?"
   - "Transpose this to G major"
   - "How difficult is this piece?"
4. **Save Work**: Store your analysis and sheet music

## 🔧 Configuration

### Required Cloudflare Resources

1. **R2 Bucket**: `reverie-r2`
2. **KV Namespace**: For caching (update ID in wrangler.toml)
3. **Durable Objects**: For session management
4. **Workers AI**: For Llama 3.1 model access

### Library Dependencies

The app includes placeholder files for:
- OpenSheetMusicDisplay (sheet music rendering)
- Essentia.js (audio analysis)
- CREPE-WASM (pitch detection)
- VexFlow (music notation)
- Tonal.js (music theory)

**Note**: Replace placeholder files with actual library files for production use.

##  License

MIT License - see LICENSE file for details.

##  Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally with `npm run dev`
5. Submit a pull request

##  Support

For issues and questions:
- Check the [Issues](https://github.com/your-repo/issues) page
- Review Cloudflare Workers documentation
- Consult the [API documentation](./docs/api.md)

