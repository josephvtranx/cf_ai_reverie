import { Hono } from 'hono';
import { cors } from 'hono/cors'
import { SessionDOId, SessionDO } from './do_session';
import { buildTransposedXML } from './score';

// Export Durable Object for Wrangler
export { SessionDO, SessionDOId };

type Env = {
  AI: Ai;
  BUCKET: R2Bucket;
  CACHE: KVNamespace;
  SESSION_DO: DurableObjectNamespace;
  APP_NAME: string;
};

const app = new Hono<{ Bindings: Env }>();
app.use('*', cors());

// Health
app.get('/api/health', (c) => c.json({ ok: true, app: c.env.APP_NAME }));

// Serve static files
app.get('/', (c) => c.text('Reverie is running! Visit /api/health for status.'));

// Create/fetch session
app.post('/api/session', async (c) => {
  const id = crypto.randomUUID();
  const doId = c.env.SESSION_DO.idFromName(id);
  const stub = c.env.SESSION_DO.get(doId);
  await stub.fetch('https://do/init', { method: 'POST', body: JSON.stringify({ createdAt: Date.now() })});
  return c.json({ sessionId: id });
});

// Upload raw mp3 to R2 (for large files)
app.put('/api/upload/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  
  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    
    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file uploaded" }, 400);
    }
    
    const buffer = await file.arrayBuffer();
    console.log("R2 Upload:", file.name, "type:", file.type, "bytes:", buffer.byteLength);
    
    if (buffer.byteLength === 0) {
      return c.json({ error: "Empty audio file" }, 400);
    }
    
    const key = `uploads/${sessionId}/${Date.now()}-${file.name}`;
    await c.env.BUCKET.put(key, buffer, { 
      httpMetadata: { 
        contentType: file.type || 'audio/mpeg',
        contentDisposition: `attachment; filename="${file.name}"`
      }
    });
    
    console.log("R2 upload successful:", key);
    return c.json({ ok: true, key, fileSize: buffer.byteLength });
  } catch (error) {
    console.error('R2 upload failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: 'R2 upload failed', details: errorMessage }, 500);
  }
});

// Save artifacts produced client-side (notes JSON + MusicXML)
app.post('/api/save/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  const body = await c.req.json<{ summary: any, musicXML: string }>();
  const scoreKey = `scores/${sessionId}/${Date.now()}.musicxml`;
  const sumKey = `summaries/${sessionId}/${Date.now()}.json`;

  await c.env.BUCKET.put(scoreKey, body.musicXML, { httpMetadata: { contentType: 'application/vnd.recordare.musicxml+xml' }});
  await c.env.BUCKET.put(sumKey, JSON.stringify(body.summary), { httpMetadata: { contentType: 'application/json' }});

  // persist to DO memory
  const doId = c.env.SESSION_DO.idFromName(sessionId);
  const stub = c.env.SESSION_DO.get(doId);
  await stub.fetch('https://do/memo', { method: 'POST', body: JSON.stringify({ lastScoreKey: scoreKey, lastSummaryKey: sumKey }) });

  return c.json({ ok: true, scoreKey, sumKey });
});

// AI Chat (text): ask questions about the piece, request transformations
app.post('/api/chat/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  const { message, musicXML } = await c.req.json<{ message: string, musicXML?: string }>();

  // System prompt primes the model for music Q&A and transformations
  const system = `
You are Reverie, a music analysis assistant. You receive MusicXML and user questions.
- If asked to transpose (e.g., "to G major, +2 semitones"), respond with ONLY updated MusicXML.
- Otherwise, answer concisely using music theory terms.
If no MusicXML is provided, reason from prior messages and say what you need.`;

  const chat = [
    { role: "system", content: system },
    ...(musicXML ? [{ role: "user", content: `MUSICXML:\n${musicXML}` as any }] : []),
    { role: "user", content: message }
  ];

  const resp = await c.env.AI.run("@cf/meta/llama-3.3-70b-instruct" as any, { messages: chat });
  return c.json(resp);
});

// Transpose on the edge (deterministic), bypassing LLM
app.post('/api/transpose', async (c) => {
  const { musicXML, semitones } = await c.req.json<{ musicXML: string, semitones: number }>();
  const out = buildTransposedXML(musicXML, semitones);
  return c.text(out, 200, { 'Content-Type': 'application/vnd.recordare.musicxml+xml' });
});

// Lyrics transcription using Whisper with ffmpeg.wasm converted audio
app.post('/api/transcribe/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  
  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    
    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file uploaded" }, 400);
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const bytes = arrayBuffer.byteLength;
    
    console.log(`Whisper: ${file.name} ${bytes} bytes`);
    
    if (bytes === 0) {
      return c.json({ error: "Empty audio file" }, 400);
    }
    
    // Check file size limit (2 MB for Whisper)
    const maxSizeBytes = 2 * 1024 * 1024; // 2 MB
    if (bytes > maxSizeBytes) {
      console.log(`Audio too large: ${bytes} bytes, max: ${maxSizeBytes} bytes`);
      return c.json({ 
        error: "Audio too large (> 2 MB)", 
        fileSize: bytes,
        maxSize: maxSizeBytes
      }, 413);
    }
    
    try {
      // Convert ArrayBuffer to Uint8Array for Whisper
      const audioData = [...new Uint8Array(arrayBuffer)];
      
      console.log(`Calling Whisper with ${audioData.length} bytes`);
      const result = await c.env.AI.run("@cf/openai/whisper" as any, { 
        audio: audioData 
      });
      
      const transcription = {
        text: result.text || "(empty)",
        language: "auto",
        confidence: 0.9
      };
      
      console.log('Whisper transcription successful');
      
      // Store transcription in session
      const doId = c.env.SESSION_DO.idFromName(sessionId);
      const stub = c.env.SESSION_DO.get(doId);
      await stub.fetch('https://do/memo', { 
        method: 'POST', 
        body: JSON.stringify({ 
          lyrics: {
            text: transcription.text,
            language: transcription.language,
            confidence: transcription.confidence,
            timestamp: Date.now(),
            model: "whisper",
            source: 'converted',
            fileSize: bytes
          }
        }) 
      });
      
      return c.json({ 
        text: transcription.text,
        model: "whisper",
        fileSize: bytes
      });
      
    } catch (whisperError) {
      console.error("Whisper error:", whisperError);
      const errorMessage = whisperError instanceof Error ? whisperError.message : String(whisperError);
      return c.json({ 
        error: `Whisper transcription failed: ${errorMessage}`,
        fileSize: bytes
      }, 500);
    }
    
  } catch (error) {
    console.error('Transcription failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: 'Transcription failed', details: errorMessage }, 500);
  }
});

// Lyrics transcription from R2 storage (for large files)
app.post('/api/transcribe-r2/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  
  try {
    const { key } = await c.req.json<{ key: string }>();
    
    if (!key) {
      return c.json({ error: "No R2 object key provided" }, 400);
    }
    
    console.log("Transcribing from R2:", key);
    
    // Get object from R2
    const object = await c.env.BUCKET.get(key);
    if (!object) {
      return c.json({ error: "File not found in R2 storage" }, 404);
    }
    
    const blob = await object.blob();
    console.log("R2 object retrieved:", blob.size, "bytes, type:", blob.type);
    
    let transcription;
    let modelUsed = "unknown";
    
    // Try Whisper first
    try {
      console.log("Attempting Whisper transcription from R2...");
      const result = await c.env.AI.run("@cf/openai/whisper-large-v3-turbo" as any, { 
        audio: blob 
      });
      
      transcription = {
        text: result.text,
        language: "auto",
        confidence: 0.9
      };
      modelUsed = "whisper";
      
      console.log('Whisper transcription from R2 successful');
    } catch (whisperError) {
      console.error("Whisper from R2 failed:", whisperError);
      
      // Fallback to Deepgram Nova-3
      try {
        console.log("Attempting Deepgram Nova-3 fallback from R2...");
        const alt = await c.env.AI.run("@cf/deepgram/nova-3" as any, { 
          audio: blob 
        });
        
        transcription = {
          text: alt.text || "[Transcription unavailable]",
          language: "auto",
          confidence: 0.8
        };
        modelUsed = "deepgram";
        
        console.log('Deepgram Nova-3 transcription from R2 successful');
      } catch (deepgramError) {
        console.error("Deepgram from R2 failed:", deepgramError);
        
        // Both models failed - return error
        return c.json({ 
          error: "Both transcription models failed", 
          whisperError: whisperError instanceof Error ? whisperError.message : String(whisperError),
          deepgramError: deepgramError instanceof Error ? deepgramError.message : String(deepgramError)
        }, 500);
      }
    }
    
    // Store transcription in session
    const doId = c.env.SESSION_DO.idFromName(sessionId);
    const stub = c.env.SESSION_DO.get(doId);
    await stub.fetch('https://do/memo', { 
      method: 'POST', 
      body: JSON.stringify({ 
        lyrics: {
          text: transcription.text,
          language: transcription.language,
          confidence: transcription.confidence,
          timestamp: Date.now(),
          model: modelUsed,
          source: 'r2',
          r2Key: key
        }
      }) 
    });
    
    return c.json({ 
      text: transcription.text,
      model: modelUsed,
      source: 'r2',
      fileSize: blob.size,
      r2Key: key
    });
  } catch (error) {
    console.error('R2 transcription failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: 'R2 transcription failed', details: errorMessage }, 500);
  }
});

// Get session data including lyrics
app.get('/api/session/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  const doId = c.env.SESSION_DO.idFromName(sessionId);
  const stub = c.env.SESSION_DO.get(doId);
  const response = await stub.fetch('https://do/get', { method: 'GET' });
  const data = await response.json();
  return c.json(data);
});

// Realtime (voice/chat) — simple WebSocket proxy to Llama 3.3 Realtime
app.get('/api/realtime', async (c) => {
  // For brevity, you can keep this as a placeholder and wire up Cloudflare Realtime SDK
  return c.text("Realtime placeholder. Hook up CF Realtime WebRTC here.");
});

export default app;
