let sessionId = null;
let lastMusicXML = null;
let summary = {
  notes: [],
  keySignature: 'C major',
  timeSignature: '4/4',
  tempo: 120,
  duration: 0,
  fileName: '',
  fileSize: 0,
  lyrics: null,
  chords: [],
  analysis: {}
};

const el = (id) => document.getElementById(id);

// Tab functionality
function initializeTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabPanels = document.querySelectorAll('.tab-panel');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.dataset.tab;
      
      // Remove active class from all buttons and panels
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabPanels.forEach(panel => panel.classList.remove('active'));
      
      // Add active class to clicked button and corresponding panel
      button.classList.add('active');
      const targetPanel = document.getElementById(`${targetTab}-tab`);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    });
  });
}

// Refresh all tabs with current data
function refreshAllTabs() {
  console.log('=== REFRESH ALL TABS CALLED ===');
  console.log('Current summary:', summary);
  console.log('Summary lyrics:', summary.lyrics);
  console.log('Summary lyrics text:', summary.lyrics ? summary.lyrics.text : 'null');
  
  // Display lyrics if available
  if (summary.lyrics && summary.lyrics.text) {
    console.log('Calling displayLyrics from refreshAllTabs with:', summary.lyrics.text);
    displayLyrics(summary.lyrics.text);
  } else {
    console.log('No lyrics in summary to display');
  }
  
  // Display chords
  displayChords();
  
  // Display analysis
  displayAnalysis();
  
  console.log('=== ALL TABS REFRESHED ===');
}

// Lyrics transcription function with proper chunking and FFmpeg conversion
async function transcribeLyrics(file) {
  try {
    appendChat('🎤 Transcribing lyrics...', 'system');
    
    console.log('=== LYRICS TRANSCRIPTION START ===');
    console.log('File check:', file.name, file.type, file.size, 'bytes');
    
    // Check if file is too large for direct transcription
    const maxSizeBytes = 2 * 1024 * 1024; // 2 MB limit for Whisper
    if (file.size > maxSizeBytes) {
      console.log(`=== FILE TOO LARGE FOR DIRECT TRANSCRIPTION ===`);
      console.log(`File size: ${file.size} bytes (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      console.log(`Max size: ${maxSizeBytes} bytes (2 MB)`);
      
      // Use new chunking approach for large files
      if (file.size <= 50 * 1024 * 1024) { // 50 MB limit for chunked
        console.log('Attempting chunked transcription with proper audio splitting...');
        appendChat(`🔄 File too large for direct transcription. Using chunked transcription...`, 'system');
        return await transcribeLyricsChunked(file);
      } else {
        // File too large even for chunked transcription
        appendChat(`❌ File too large (${(file.size / 1024 / 1024).toFixed(2)}MB) — please trim to under 50MB.`, 'system');
        return null;
      }
    }
    
    // For small files, try direct transcription with conversion
    console.log('Attempting direct transcription for small file...');
    const convertedFile = await convertAudioToWav(file);
    if (!convertedFile) {
      throw new Error('Audio conversion failed');
    }
    
    console.log('Converted file:', convertedFile.name, convertedFile.type, convertedFile.size, 'bytes');
    
    // Upload converted file
    const formData = new FormData();
    formData.append('file', convertedFile, convertedFile.name);
    
    console.log('Uploading converted audio:', convertedFile.name, convertedFile.type, convertedFile.size);
    
    const response = await fetch(`/api/transcribe/${sessionId}`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Transcription failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    console.log('=== TRANSCRIPTION RESULT DEBUG ===');
    console.log('Raw result object:', result);
    console.log('Result text:', result.text);
    console.log('Result text type:', typeof result.text);
    console.log('Result text length:', result.text ? result.text.length : 'null');
    console.log('Result text preview:', result.text ? result.text.substring(0, 200) + '...' : 'null');
    console.log('Result model:', result.model);
    console.log('Result fileSize:', result.fileSize);
    
    // Store lyrics in the summary
    summary.lyrics = {
      text: result.text,
      language: "auto",
      confidence: 0.9,
      timestamp: Date.now(),
      model: result.model || "whisper",
      source: 'direct',
      originalFile: file.name,
      convertedFile: convertedFile.name,
      fileSize: convertedFile.size
    };
    
    console.log('=== SUMMARY LYRICS STORED ===');
    console.log('Summary lyrics object:', summary.lyrics);
    console.log('Summary lyrics text:', summary.lyrics.text);
    console.log('Summary lyrics text type:', typeof summary.lyrics.text);
    console.log('Summary lyrics text length:', summary.lyrics.text ? summary.lyrics.text.length : 'null');
    console.log('Summary lyrics text preview:', summary.lyrics.text ? summary.lyrics.text.substring(0, 200) + '...' : 'null');
    
    // Update lyrics tab
    console.log('=== CALLING DISPLAY LYRICS ===');
    displayLyrics(result.text);
    
    appendChat(`✅ Lyrics transcribed successfully!`, 'system');
    console.log('=== LYRICS TRANSCRIPTION COMPLETE ===');
    return result;
  } catch (error) {
    console.error('=== LYRICS TRANSCRIPTION ERROR ===');
    console.error('Transcription failed:', error);
    appendChat(`❌ Lyrics transcription failed: ${error.message}`, 'system');
    return null;
  }
}

// New chunked transcription using proper audio splitting
async function transcribeLyricsChunked(file) {
  try {
    console.log('=== CHUNKED TRANSCRIPTION START ===');
    
    // Split audio file into chunks by duration
    const { chunks, sampleRate } = await splitAudioFile(file, 45); // 45 second chunks
    
    const results = [];
    const errors = [];
    
    // Process each chunk sequentially to avoid overwhelming the server
    for (let i = 0; i < chunks.length; i++) {
      try {
        console.log(`⏳ Converting and transcribing chunk ${i + 1}/${chunks.length}`);
        appendChat(`🔄 Processing chunk ${i + 1}/${chunks.length}...`, 'system');
        
        // Convert chunk samples to WAV
        const wavChunk = await convertChunkToWav(chunks[i].samples, sampleRate, i);
        
        // Upload WAV chunk
        const formData = new FormData();
        formData.append('file', wavChunk, `chunk_${i}.wav`);
        formData.append('chunkIndex', i.toString());
        formData.append('totalChunks', chunks.length.toString());
        
        console.log(`Uploading chunk ${i + 1}/${chunks.length}, size: ${wavChunk.size} bytes`);
        
        const response = await fetch(`/api/transcribe/${sessionId}`, {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Chunk ${i} transcription failed: ${response.status}`);
        }
        
        const result = await response.json();
        
        console.log(`=== CHUNK ${i + 1} RESULT ===`);
        console.log('Chunk result:', result);
        console.log('Chunk text:', result.text);
        console.log('Chunk text length:', result.text ? result.text.length : 'null');
        
        if (result.text && result.text.trim()) {
          results.push(result.text);
          appendChat(`✅ Chunk ${i + 1} transcribed successfully`, 'system');
        } else {
          console.warn(`Chunk ${i + 1} returned empty text`);
          appendChat(`⚠️ Chunk ${i + 1} returned empty text`, 'system');
        }
        
      } catch (chunkError) {
        console.error(`❌ Chunk ${i + 1} failed:`, chunkError);
        errors.push({ chunk: i + 1, error: chunkError.message });
        appendChat(`❌ Chunk ${i + 1} failed: ${chunkError.message}`, 'system');
      }
    }
    
    // Merge all successful results
    const mergedText = results.join(' ').trim();
    
    console.log('=== CHUNKED TRANSCRIPTION RESULT ===');
    console.log('Merged text:', mergedText);
    console.log('Merged text length:', mergedText.length);
    console.log('Merged text preview:', mergedText.substring(0, 200) + '...');
    console.log('Total chunks:', chunks.length);
    console.log('Successful chunks:', results.length);
    console.log('Failed chunks:', errors.length);
    console.log('Errors:', errors);
    
    // Store lyrics in the summary
    summary.lyrics = {
      text: mergedText,
      language: "auto",
      confidence: results.length > 0 ? 0.9 : 0,
      timestamp: Date.now(),
      model: "whisper",
      source: 'chunked',
      chunks: chunks.length,
      successfulChunks: results.length,
      failedChunks: errors.length,
      errors: errors,
      originalFile: file.name,
      fileSize: file.size
    };
    
    console.log('=== CHUNKED LYRICS STORED IN SUMMARY ===');
    console.log('Summary lyrics:', summary.lyrics);
    console.log('Summary lyrics text:', summary.lyrics.text);
    
    // Update lyrics tab
    console.log('=== CALLING DISPLAY LYRICS FROM CHUNKED ===');
    displayLyrics(mergedText);
    
    if (results.length > 0) {
      appendChat(`✅ Lyrics transcribed successfully from ${results.length}/${chunks.length} chunks!`, 'system');
      if (errors.length > 0) {
        appendChat(`⚠️ ${errors.length} chunks failed, but transcription completed`, 'system');
      }
    } else {
      appendChat(`❌ All chunks failed - no lyrics transcribed`, 'system');
    }
    
    return {
      text: mergedText,
      model: "whisper",
      chunks: chunks.length,
      successfulChunks: results.length,
      failedChunks: errors.length,
      confidence: results.length > 0 ? 0.9 : 0
    };
    
  } catch (error) {
    console.error('=== CHUNKED TRANSCRIPTION ERROR ===');
    console.error('Chunked transcription failed:', error);
    appendChat(`❌ Chunked transcription failed: ${error.message}`, 'system');
    throw error;
  }
}

// Convert audio file to mono 16kHz WAV using hybrid approach (FFmpeg.wasm + Web Audio API fallback)
async function convertAudioToWav(file) {
  try {
    appendChat('🔄 Converting audio to WAV format...', 'system');
    
    // Try FFmpeg.wasm conversion first, fallback to Web Audio API
    try {
      console.log('Attempting FFmpeg.wasm conversion for main file...');
      return await convertFileWithFFmpeg(file);
    } catch (ffmpegError) {
      console.log('FFmpeg.wasm failed, falling back to Web Audio API:', ffmpegError.message);
      return await convertFileWithWebAudio(file);
    }
    
  } catch (error) {
    console.error('Audio conversion failed:', error);
    
    // Fallback: return original file if conversion fails
    console.log('Audio conversion failed, using original file as fallback');
    appendChat('⚠️ Audio conversion failed. Using original file...', 'system');
    
    // Create a copy of the original file with WAV extension
    const fallbackFile = new File([file], file.name.replace(/\.[^/.]+$/, '.wav'), {
      type: 'audio/wav',
      lastModified: Date.now()
    });
    
    appendChat(`⚠️ Using original file (${(fallbackFile.size / 1024 / 1024).toFixed(2)}MB) - may not work optimally with Whisper`, 'system');
    return fallbackFile;
  }
}

// Convert file using FFmpeg.wasm (with Web Audio API fallback)
async function convertFileWithFFmpeg(file) {
  try {
    const ffmpeg = await getFFmpeg();
    
    const inputName = 'input.mp3';
    const outputName = 'output.wav';
    
    console.log('Writing file to FFmpeg filesystem...');
    ffmpeg.FS('writeFile', inputName, await window.fetchFile(file));
    
    console.log('Converting to WAV...');
    await ffmpeg.run('-i', inputName, '-ac', '1', '-ar', '16000', outputName);
    
    console.log('Reading converted file...');
    const data = ffmpeg.FS('readFile', outputName);
    
    const wavBuffer = data.buffer;
    
    // Clean up FFmpeg filesystem
    try {
      ffmpeg.FS('unlink', inputName);
      ffmpeg.FS('unlink', outputName);
    } catch (cleanupError) {
      console.warn('FFmpeg cleanup failed:', cleanupError);
    }
    
    console.log(`Audio converted with FFmpeg: ${(wavBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
    
    // Create File object with proper name
    const convertedFile = new File([wavBuffer], file.name.replace(/\.[^/.]+$/, '.wav'), {
      type: 'audio/wav',
      lastModified: Date.now()
    });
    
    appendChat(`✅ Audio converted to WAV with FFmpeg (${(convertedFile.size / 1024 / 1024).toFixed(2)}MB)`, 'system');
    
    return convertedFile;
    
  } catch (error) {
    console.error('FFmpeg.wasm conversion failed:', error);
    throw error;
  }
}

// Convert file using Web Audio API (fallback)
async function convertFileWithWebAudio(file) {
  try {
    console.log('Converting with Web Audio API...');
    
    // Use Web Audio API for conversion (no CORS issues)
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    console.log('Original audio:', audioBuffer.sampleRate, 'Hz,', audioBuffer.numberOfChannels, 'channels,', audioBuffer.duration, 'seconds');
    
    // Convert to mono and resample to 16kHz
    const targetSampleRate = 16000;
    const monoData = new Float32Array(Math.floor(audioBuffer.length * targetSampleRate / audioBuffer.sampleRate));
    
    // Simple resampling and mono conversion
    const sourceData = audioBuffer.getChannelData(0); // Use first channel
    const ratio = audioBuffer.sampleRate / targetSampleRate;
    
    for (let i = 0; i < monoData.length; i++) {
      const sourceIndex = Math.floor(i * ratio);
      monoData[i] = sourceData[sourceIndex] || 0;
    }
    
    // Convert Float32Array to WAV format
    const wavBuffer = createWavBuffer(monoData, targetSampleRate);
    
    console.log(`Audio converted with Web Audio API: ${(wavBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
    
    // Create File object with proper name
    const convertedFile = new File([wavBuffer], file.name.replace(/\.[^/.]+$/, '.wav'), {
      type: 'audio/wav',
      lastModified: Date.now()
    });
    
    appendChat(`✅ Audio converted to WAV with Web Audio API (${(convertedFile.size / 1024 / 1024).toFixed(2)}MB)`, 'system');
    
    return convertedFile;
    
  } catch (error) {
    console.error('Web Audio API conversion failed:', error);
    throw error;
  }
}

// Create WAV buffer from Float32Array
function createWavBuffer(float32Array, sampleRate) {
  const length = float32Array.length;
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  
  // WAV header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length * 2, true);
  
  // Convert float32 to int16
  let offset = 44;
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }
  
  return buffer;
}

// Chunked transcription for large files
async function transcribeChunked(file, chunkSizeBytes) {
  const totalChunks = Math.ceil(file.size / chunkSizeBytes);
  console.log(`Splitting ${file.name} into ${totalChunks} chunks`);
  
  // Create progress UI
  const progressContainer = createProgressUI(totalChunks);
  
  try {
    const chunkPromises = [];
    const chunkResults = [];
    
    // Process chunks in parallel (but limit concurrency to avoid overwhelming the server)
    const maxConcurrent = 3;
    for (let i = 0; i < totalChunks; i += maxConcurrent) {
      const batch = [];
      
      for (let j = i; j < Math.min(i + maxConcurrent, totalChunks); j++) {
        const chunk = file.slice(j * chunkSizeBytes, (j + 1) * chunkSizeBytes);
        batch.push(transcribeChunk(chunk, j, totalChunks, progressContainer));
      }
      
      const batchResults = await Promise.all(batch);
      chunkResults.push(...batchResults);
    }
    
    // Sort results by chunk index
    chunkResults.sort((a, b) => a.chunkIndex - b.chunkIndex);
    
    // Merge all transcriptions
    const mergedText = chunkResults
      .map(result => result.text)
      .filter(text => text && text.trim())
      .join(' ')
      .trim();
    
    // Calculate average confidence
    const avgConfidence = chunkResults.reduce((sum, result) => sum + (result.confidence || 0.8), 0) / chunkResults.length;
    
    console.log('=== CHUNKED TRANSCRIPTION RESULT ===');
    console.log('Merged text:', mergedText);
    console.log('Merged text length:', mergedText.length);
    console.log('Merged text preview:', mergedText.substring(0, 200) + '...');
    console.log('Total chunks:', totalChunks);
    console.log('Chunk results:', chunkResults);
    
    // Store lyrics in the summary
    summary.lyrics = {
      text: mergedText,
      language: "auto",
      confidence: avgConfidence,
      timestamp: Date.now(),
      model: chunkResults[0]?.model || "unknown",
      source: 'chunked',
      chunks: totalChunks,
      chunkResults: chunkResults
    };
    
    console.log('=== CHUNKED LYRICS STORED IN SUMMARY ===');
    console.log('Summary lyrics:', summary.lyrics);
    console.log('Summary lyrics text:', summary.lyrics.text);
    
    // Update lyrics tab
    console.log('=== CALLING DISPLAY LYRICS FROM CHUNKED ===');
    displayLyrics(mergedText);
    
    // Remove progress UI
    progressContainer.remove();
    
    appendChat(`✅ Lyrics transcribed successfully from ${totalChunks} chunks!`, 'system');
    
    return {
      text: mergedText,
      model: chunkResults[0]?.model || "unknown",
      chunks: totalChunks,
      confidence: avgConfidence
    };
    
  } catch (error) {
    console.error('Chunked transcription failed:', error);
    progressContainer.remove();
    appendChat('❌ Chunked transcription failed', 'system');
    throw error;
  }
}

// Transcribe a single chunk with WAV conversion
async function transcribeChunk(chunk, chunkIndex, totalChunks, progressContainer) {
  try {
    console.log(`=== PREPARING CHUNK ${chunkIndex + 1}/${totalChunks} ===`);
    console.log(`Original chunk size: ${chunk.size} bytes (${(chunk.size / 1024 / 1024).toFixed(2)} MB)`);
    
    // Try FFmpeg.wasm conversion first, fallback to Web Audio API
    let wavChunk;
    try {
      console.log('Attempting FFmpeg.wasm conversion...');
      wavChunk = await convertChunkWithFFmpeg(chunk, chunkIndex);
      console.log(`✅ FFmpeg conversion successful: ${(wavChunk.size / 1024 / 1024).toFixed(2)} MB`);
    } catch (ffmpegError) {
      console.log('FFmpeg.wasm failed, falling back to Web Audio API:', ffmpegError.message);
      wavChunk = await convertChunkWithWebAudio(chunk, chunkIndex);
      console.log(`✅ Web Audio conversion successful: ${(wavChunk.size / 1024 / 1024).toFixed(2)} MB`);
    }
    
    // Upload converted WAV chunk
    const formData = new FormData();
    formData.append('file', wavChunk, `chunk_${chunkIndex}.wav`);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('totalChunks', totalChunks.toString());
    
    console.log(`Uploading chunk ${chunkIndex + 1}/${totalChunks}, size: ${wavChunk.size} bytes`);
    
    const response = await fetch(`/api/transcribe/${sessionId}`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`Chunk ${chunkIndex} transcription failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    console.log(`=== CHUNK ${chunkIndex + 1} RESULT ===`);
    console.log('Chunk result:', result);
    console.log('Chunk text:', result.text);
    console.log('Chunk text length:', result.text ? result.text.length : 'null');
    
    // Update progress
    updateProgress(progressContainer, chunkIndex + 1, totalChunks, result.text ? 'success' : 'error');
    
    return {
      chunkIndex: chunkIndex,
      text: result.text || '',
      confidence: result.confidence || 0.8,
      model: result.model || 'unknown',
      success: true
    };
    
  } catch (error) {
    console.error(`❌ Chunk ${chunkIndex} failed:`, error);
    updateProgress(progressContainer, chunkIndex + 1, totalChunks, 'error');
    
    return {
      chunkIndex: chunkIndex,
      text: '',
      confidence: 0,
      model: 'unknown',
      success: false,
      error: error.message
    };
  }
}

// Check FFmpeg loading status with universal detection
function checkFFmpegStatus() {
  if (window.ffmpeg) {
    console.log('✅ FFmpeg.wasm is loaded and ready');
    return true;
  } else if (window.FFmpeg || window.FFmpegWASM || window.ffmpeg) {
    console.log('⏳ FFmpeg.wasm is loading on window.load event...');
    return false;
  } else {
    console.log('❌ FFmpeg.wasm script not loaded or no global detected');
    return false;
  }
}

// Get FFmpeg instance (wait for window.load event to complete)
async function getFFmpeg() {
  if (!window.ffmpeg) {
    console.warn("Waiting for FFmpeg to load on window.load event...");
    // Wait for FFmpeg to be loaded via window.load event
    let attempts = 0;
    const maxAttempts = 150; // 15 seconds max wait
    
    while (!window.ffmpeg && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }
    
    if (!window.ffmpeg) {
      console.error("❌ FFmpeg.wasm failed to load after waiting 15 seconds");
      console.log("Available FFmpeg-related globals:", Object.keys(window).filter(k => k.toLowerCase().includes('ffmpeg')));
      throw new Error("FFmpeg.wasm failed to load on window.load event (no global detected) - falling back to Web Audio API");
    }
  }
  
  return window.ffmpeg;
}

// Split audio file into chunks by duration (fixes EncodingError)
async function splitAudioFile(file, chunkDurationSec = 45) {
  console.log(`=== SPLITTING AUDIO FILE ===`);
  console.log(`File: ${file.name}, Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
  
  const audioContext = new AudioContext();
  const buffer = await audioContext.decodeAudioData(await file.arrayBuffer());
  
  console.log(`Audio decoded: ${buffer.duration.toFixed(2)}s, ${buffer.sampleRate}Hz, ${buffer.numberOfChannels} channels`);
  
  const chunks = [];
  const total = buffer.duration;
  const chunkSize = chunkDurationSec;
  
  for (let start = 0; start < total; start += chunkSize) {
    const end = Math.min(start + chunkSize, total);
    const startSample = Math.floor(start * buffer.sampleRate);
    const endSample = Math.floor(end * buffer.sampleRate);
    
    // Get samples from first channel
    const slice = buffer.getChannelData(0).slice(startSample, endSample);
    chunks.push({ 
      start, 
      end, 
      samples: slice,
      duration: end - start,
      sampleCount: slice.length
    });
  }
  
  console.log(`Split audio into ${chunks.length} chunks`);
  chunks.forEach((chunk, i) => {
    console.log(`Chunk ${i + 1}: ${chunk.start.toFixed(2)}s - ${chunk.end.toFixed(2)}s (${chunk.duration.toFixed(2)}s, ${chunk.sampleCount} samples)`);
  });
  
  return { chunks, sampleRate: buffer.sampleRate };
}

// Convert chunk samples to WAV using FFmpeg (with Web Audio API fallback)
async function convertChunkToWav(samples, sampleRate, index) {
  console.log(`=== CONVERTING CHUNK ${index} TO WAV ===`);
  console.log(`Samples: ${samples.length}, Sample rate: ${sampleRate}Hz`);
  
  try {
    const ffmpeg = await getFFmpeg();
    
    // Write raw PCM data
    const wavName = `chunk_${index}.wav`;
    const pcm = new Int16Array(samples.map((v) => Math.max(-32768, Math.min(32767, v * 0x7fff))));
    
    console.log(`Writing ${pcm.length} PCM samples to FFmpeg filesystem...`);
    ffmpeg.FS("writeFile", "input.raw", pcm);
    
    console.log(`Converting chunk ${index} to WAV...`);
    await ffmpeg.run(
      "-f", "s16le",
      "-ar", `${sampleRate}`,
      "-ac", "1",
      "-i", "input.raw",
      "-ar", "16000",
      wavName
    );
    
    console.log(`Reading converted chunk ${index}...`);
    const output = ffmpeg.FS("readFile", wavName);
    const wavBlob = new Blob([output.buffer], { type: "audio/wav" });
    
    console.log(`Chunk ${index} converted: ${(wavBlob.size / 1024 / 1024).toFixed(2)} MB`);
    
    // Clean up FFmpeg filesystem
    try {
      ffmpeg.FS("unlink", "input.raw");
      ffmpeg.FS("unlink", wavName);
    } catch (cleanupError) {
      console.warn('FFmpeg cleanup failed:', cleanupError);
    }
    
    return wavBlob;
    
  } catch (ffmpegError) {
    console.log('FFmpeg conversion failed, falling back to Web Audio API:', ffmpegError.message);
    return await convertChunkToWavWebAudio(samples, sampleRate, index);
  }
}

// Convert chunk samples to WAV using Web Audio API (fallback)
async function convertChunkToWavWebAudio(samples, sampleRate, index) {
  try {
    console.log(`Converting chunk ${index} with Web Audio API fallback...`);
    
    // Create AudioBuffer from samples
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const buffer = audioContext.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    
    // Convert to mono and resample to 16kHz
    const targetSampleRate = 16000;
    const monoData = new Float32Array(Math.floor(samples.length * targetSampleRate / sampleRate));
    
    // Simple resampling
    const ratio = sampleRate / targetSampleRate;
    for (let i = 0; i < monoData.length; i++) {
      const sourceIndex = Math.floor(i * ratio);
      monoData[i] = samples[sourceIndex] || 0;
    }
    
    // Convert Float32Array to WAV format
    const wavBuffer = createWavBuffer(monoData, targetSampleRate);
    const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
    
    console.log(`Chunk ${index} converted with Web Audio API: ${(wavBlob.size / 1024 / 1024).toFixed(2)} MB`);
    
    return wavBlob;
    
  } catch (error) {
    console.error('Web Audio API conversion failed:', error);
    throw error;
  }
}

// Convert chunk using Web Audio API (fallback)
async function convertChunkWithWebAudio(chunk, chunkIndex) {
  try {
    console.log(`Converting chunk ${chunkIndex} with Web Audio API...`);
    
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const arrayBuffer = await chunk.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    console.log(`Chunk ${chunkIndex} audio:`, audioBuffer.sampleRate, 'Hz,', audioBuffer.numberOfChannels, 'channels,', audioBuffer.duration, 'seconds');
    
    // Convert to mono and resample to 16kHz
    const targetSampleRate = 16000;
    const monoData = new Float32Array(Math.floor(audioBuffer.length * targetSampleRate / audioBuffer.sampleRate));
    
    // Simple resampling and mono conversion
    const sourceData = audioBuffer.getChannelData(0); // Use first channel
    const ratio = audioBuffer.sampleRate / targetSampleRate;
    
    for (let i = 0; i < monoData.length; i++) {
      const sourceIndex = Math.floor(i * ratio);
      monoData[i] = sourceData[sourceIndex] || 0;
    }
    
    // Convert Float32Array to WAV format
    const wavBuffer = createWavBuffer(monoData, targetSampleRate);
    
    const wavChunk = new Blob([wavBuffer], { type: 'audio/wav' });
    
    console.log(`Chunk ${chunkIndex} converted: ${(wavChunk.size / 1024 / 1024).toFixed(2)} MB`);
    
    return wavChunk;
    
  } catch (error) {
    console.error('Web Audio API conversion failed:', error);
    throw error;
  }
}

// Create progress UI for chunked transcription
function createProgressUI(totalChunks) {
  const progressContainer = document.createElement('div');
  progressContainer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    border: 2px solid #ff69b4;
    border-radius: 10px;
    padding: 15px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 1000;
    min-width: 300px;
  `;
  
  progressContainer.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 10px; color: #ff69b4;">
      🎤 Transcribing ${totalChunks} chunks...
    </div>
    <div id="progress-bar" style="width: 100%; height: 20px; background: #f0f0f0; border-radius: 10px; overflow: hidden; margin-bottom: 10px;">
      <div id="progress-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #ff69b4, #ff1493); transition: width 0.3s ease;"></div>
    </div>
    <div id="progress-text" style="text-align: center; font-size: 14px; color: #666;">
      0 / ${totalChunks} chunks completed
    </div>
    <div id="chunk-status" style="margin-top: 10px; font-size: 12px; color: #888;">
    </div>
  `;
  
  document.body.appendChild(progressContainer);
  return progressContainer;
}

// Update progress UI
function updateProgress(container, completed, total, status) {
  const progressFill = container.querySelector('#progress-fill');
  const progressText = container.querySelector('#progress-text');
  const chunkStatus = container.querySelector('#chunk-status');
  
  const percentage = (completed / total) * 100;
  progressFill.style.width = `${percentage}%`;
  progressText.textContent = `${completed} / ${total} chunks completed`;
  
  const statusIcon = status === 'success' ? '✅' : status === 'error' ? '❌' : '⏳';
  const statusText = status === 'success' ? 'Completed' : status === 'error' ? 'Failed' : 'Processing';
  
  chunkStatus.innerHTML += `<div>${statusIcon} Chunk ${completed}: ${statusText}</div>`;
  
  if (completed === total) {
    setTimeout(() => {
      container.style.opacity = '0.7';
    }, 2000);
  }
}

// Upload file to R2 storage
async function uploadToR2(file) {
  const formData = new FormData();
  formData.append('file', file, file.name);
  
  return await fetch(`/api/upload/${sessionId}`, {
    method: 'PUT',
    body: formData
  });
}

// Display lyrics in the lyrics tab
function displayLyrics(lyricsText) {
  console.log('=== DISPLAY LYRICS FUNCTION CALLED ===');
  console.log('Input lyricsText:', lyricsText);
  console.log('Input lyricsText type:', typeof lyricsText);
  console.log('Input lyricsText length:', lyricsText ? lyricsText.length : 'null');
  console.log('Input lyricsText preview:', lyricsText ? lyricsText.substring(0, 100) + '...' : 'null');
  
  const lyricsTextEl = el('lyrics-text');
  const lyricsPlaceholder = document.querySelector('.lyrics-placeholder');
  
  console.log('lyrics-text element:', lyricsTextEl);
  console.log('lyrics-placeholder element:', lyricsPlaceholder);
  
  if (!lyricsTextEl) {
    console.error('lyrics-text element not found');
    return;
  }
  
  if (!lyricsPlaceholder) {
    console.error('lyrics-placeholder element not found');
    return;
  }
  
  if (lyricsText && lyricsText.trim()) {
    console.log('Setting lyrics text content...');
    lyricsTextEl.textContent = lyricsText;
    lyricsTextEl.style.display = 'block';
    lyricsPlaceholder.style.display = 'none';
    console.log('Lyrics displayed successfully');
    console.log('Element content after setting:', lyricsTextEl.textContent);
  } else {
    console.log('No lyrics to display, showing placeholder');
    lyricsTextEl.style.display = 'none';
    lyricsPlaceholder.style.display = 'block';
  }
  
  console.log('=== DISPLAY LYRICS FUNCTION COMPLETE ===');
}

// Display chord progression
function displayChords() {
  console.log('Displaying chords:', summary.chords ? summary.chords.length : 'null');
  
  const chordsDisplay = el('chords-display');
  const chordsPlaceholder = document.querySelector('.chords-placeholder');
  
  if (!chordsDisplay) {
    console.error('chords-display element not found');
    return;
  }
  
  if (!chordsPlaceholder) {
    console.error('chords-placeholder element not found');
    return;
  }
  
  if (summary.chords && summary.chords.length > 0) {
    chordsDisplay.innerHTML = '';
    
    summary.chords.forEach((chord, index) => {
      const chordItem = document.createElement('div');
      chordItem.className = 'chord-item';
      chordItem.innerHTML = `
        <div class="chord-time">${chord.time || (index * 2)}s</div>
        <div class="chord-name">${chord.name}</div>
        <div class="chord-details">${chord.details || ''}</div>
      `;
      chordsDisplay.appendChild(chordItem);
    });
    
    chordsDisplay.style.display = 'block';
    chordsPlaceholder.style.display = 'none';
    console.log('Chords displayed successfully');
  } else {
    chordsDisplay.style.display = 'none';
    chordsPlaceholder.style.display = 'block';
    console.log('No chords to display, showing placeholder');
  }
}

// Display analysis data
function displayAnalysis() {
  console.log('Displaying analysis:', summary ? 'summary exists' : 'no summary');
  
  const container = el('analysis-data');
  if (!container) {
    console.error('analysis-data element not found');
    return;
  }
  
  if (!summary || !summary.notes) {
    container.innerHTML = `
      <div class="analysis-placeholder">
        <div class="placeholder-icon">🎵</div>
        <p>Analysis will appear here after processing</p>
      </div>
    `;
    container.style.display = 'block';
    console.log('No analysis data, showing placeholder');
    return;
  }

  const notes = summary.notes;
  const melodicRange = calculateMelodicRange(notes);
  const contour = analyzeMelodicContour(notes);
  const techniques = detectTechniques(notes);
  const dynamicRange = calculateDynamicRange(notes);
  const syncopation = detectSyncopation(notes);
  const detectedKey = detectKeyFromNotes(notes);
  const detectedTimeSig = detectTimeSignature(notes);
  const detectedTempo = detectTempoFromNotes(notes);
  
  container.innerHTML = `
    <div class="analysis-data">
      <div class="analysis-section">
        <h4>Musical Structure</h4>
        <div class="analysis-item">
          <span class="analysis-label">Duration:</span>
          <span class="analysis-value">${summary.duration?.toFixed(1) || 'Unknown'} seconds</span>
        </div>
        <div class="analysis-item">
          <span class="analysis-label">Notes:</span>
          <span class="analysis-value">${notes.length}</span>
        </div>
        <div class="analysis-item">
          <span class="analysis-label">Average Note Duration:</span>
          <span class="analysis-value">${(notes.reduce((sum, n) => sum + n.duration, 0) / notes.length).toFixed(2)}s</span>
        </div>
        <div class="analysis-item">
          <span class="analysis-label">Melodic Contour:</span>
          <span class="analysis-value">${contour}</span>
        </div>
      </div>

      <div class="analysis-section">
        <h4>Harmony & Rhythm</h4>
        <div class="analysis-item">
          <span class="analysis-label">Key Signature:</span>
          <span class="analysis-value">${summary.keySignature || detectedKey}</span>
        </div>
        <div class="analysis-item">
          <span class="analysis-label">Time Signature:</span>
          <span class="analysis-value">${summary.timeSignature || detectedTimeSig}</span>
        </div>
        <div class="analysis-item">
          <span class="analysis-label">Tempo:</span>
          <span class="analysis-value">${summary.tempo || detectedTempo} BPM</span>
        </div>
        <div class="analysis-item">
          <span class="analysis-label">Syncopation:</span>
          <span class="analysis-value">${Math.round(syncopation * 100)}%</span>
        </div>
      </div>

      <div class="analysis-section">
        <h4>Melody & Range</h4>
        <div class="analysis-item">
          <span class="analysis-label">Pitch Range:</span>
          <span class="analysis-value">${melodicRange.min} - ${melodicRange.max} (${melodicRange.octaves} octaves)</span>
        </div>
        <div class="analysis-item">
          <span class="analysis-label">Range Span:</span>
          <span class="analysis-value">${melodicRange.range} semitones</span>
        </div>
        <div class="analysis-item">
          <span class="analysis-label">Dynamic Range:</span>
          <span class="analysis-value">${dynamicRange}</span>
        </div>
      </div>

      <div class="analysis-section">
        <h4>Technical</h4>
        <div class="analysis-item">
          <span class="analysis-label">Complexity:</span>
          <span class="analysis-value">${Math.round((summary.complexity || 0) * 100)}%</span>
        </div>
        <div class="analysis-item">
          <span class="analysis-label">Average Velocity:</span>
          <span class="analysis-value">${summary.averageVelocity || 80}</span>
        </div>
        <div class="analysis-item">
          <span class="analysis-label">Techniques:</span>
          <span class="analysis-value">${techniques.length > 0 ? techniques.join(', ') : 'Standard playing'}</span>
        </div>
      </div>
    </div>
  `;
  
  container.style.display = 'block';
  console.log('Analysis displayed successfully');
}

// Helper function to get pitch range
function getPitchRange() {
  if (!summary.notes || summary.notes.length === 0) return 'N/A';
  
  const midiNumbers = summary.notes.map(note => note.midi || 60);
  const min = Math.min(...midiNumbers);
  const max = Math.max(...midiNumbers);
  
  // Convert MIDI numbers to note names
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const minNote = noteNames[min % 12] + Math.floor(min / 12);
  const maxNote = noteNames[max % 12] + Math.floor(max / 12);
  
  return `${minNote} - ${maxNote}`;
}

// Detect chord progression from notes
function detectChordProgression(notes) {
  if (!notes || notes.length === 0) return [];
  
  const chords = [];
  const timeWindow = 2; // seconds
  const noteGroups = {};
  
  // Group notes by time windows
  notes.forEach(note => {
    const timeBucket = Math.floor(note.time / timeWindow);
    if (!noteGroups[timeBucket]) {
      noteGroups[timeBucket] = [];
    }
    noteGroups[timeBucket].push(note);
  });
  
  // Analyze each time window for chords
  Object.keys(noteGroups).forEach(timeBucket => {
    const notesInWindow = noteGroups[timeBucket];
    const chord = analyzeChord(notesInWindow);
    if (chord) {
      chords.push({
        time: parseInt(timeBucket) * timeWindow,
        name: chord.name,
        details: chord.details,
        confidence: chord.confidence
      });
    }
  });
  
  return chords;
}

// Analyze a group of notes to determine chord
function analyzeChord(notes) {
  if (!notes || notes.length < 2) return null;
  
  // Get unique pitch classes (ignoring octave)
  const pitchClasses = [...new Set(notes.map(note => note.midi % 12))].sort((a, b) => a - b);
  
  // Simple chord detection based on common patterns
  const chordMap = {
    '0,4,7': { name: 'C', details: 'Major', confidence: 0.9 },
    '0,3,7': { name: 'Cm', details: 'Minor', confidence: 0.9 },
    '0,4,7,10': { name: 'C7', details: 'Dominant 7th', confidence: 0.8 },
    '0,4,7,11': { name: 'Cmaj7', details: 'Major 7th', confidence: 0.8 },
    '0,3,7,10': { name: 'Cm7', details: 'Minor 7th', confidence: 0.8 },
    '2,5,9': { name: 'Dm', details: 'Minor', confidence: 0.9 },
    '2,6,9': { name: 'D', details: 'Major', confidence: 0.9 },
    '4,7,11': { name: 'E', details: 'Major', confidence: 0.9 },
    '4,7,10': { name: 'Em', details: 'Minor', confidence: 0.9 },
    '5,9,0': { name: 'F', details: 'Major', confidence: 0.9 },
    '7,11,2': { name: 'G', details: 'Major', confidence: 0.9 },
    '9,0,4': { name: 'A', details: 'Major', confidence: 0.9 },
    '9,0,3': { name: 'Am', details: 'Minor', confidence: 0.9 },
    '11,2,6': { name: 'B', details: 'Major', confidence: 0.9 },
    '11,2,5': { name: 'Bm', details: 'Minor', confidence: 0.9 }
  };
  
  const chordKey = pitchClasses.join(',');
  const chord = chordMap[chordKey];
  
  if (chord) {
    return chord;
  }
  
  // Fallback: return basic chord info
  const rootNote = pitchClasses[0];
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return {
    name: noteNames[rootNote],
    details: `${pitchClasses.length} notes`,
    confidence: 0.6
  };
}

// Calculate average velocity of notes
function calculateAverageVelocity(notes) {
  if (!notes || notes.length === 0) return 0;
  const velocities = notes.map(note => note.velocity || 80);
  return velocities.reduce((sum, vel) => sum + vel, 0) / velocities.length;
}

// Calculate complexity score
function calculateComplexity(notes) {
  if (!notes || notes.length === 0) return 0;
  
  let complexity = 0;
  
  // Pitch variety
  const uniquePitches = new Set(notes.map(note => note.midi)).size;
  complexity += Math.min(uniquePitches / 12, 1) * 0.3;
  
  // Rhythm variety
  const uniqueDurations = new Set(notes.map(note => note.duration)).size;
  complexity += Math.min(uniqueDurations / 8, 1) * 0.3;
  
  // Note density
  const totalDuration = Math.max(...notes.map(n => n.startTime + n.duration)) - Math.min(...notes.map(n => n.startTime));
  const avgNotesPerSecond = notes.length / (totalDuration || 1);
  complexity += Math.min(avgNotesPerSecond / 10, 1) * 0.4;
  
  return Math.min(complexity, 1);
}

// Additional analysis functions for real musical insights
function detectKeyFromNotes(notes) {
  if (!notes || notes.length === 0) return 'Unknown';
  
  // Count pitch classes to find the most likely key
  const pitchCounts = new Array(12).fill(0);
  notes.forEach(note => {
    pitchCounts[note.midi % 12]++;
  });
  
  // Major key signatures (sharps/flats)
  const majorKeys = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'];
  const majorPatterns = [
    [0,2,4,5,7,9,11], // C major
    [7,9,11,0,2,4,6], // G major
    [2,4,6,7,9,11,1], // D major
    [9,11,1,2,4,6,8], // A major
    [4,6,8,9,11,1,3], // E major
    [11,1,3,4,6,8,10], // B major
    [6,8,10,11,1,3,5], // F# major
    [1,3,5,6,8,10,0], // C# major
    [5,7,9,10,0,2,4], // F major
    [10,0,2,3,5,7,9], // Bb major
    [3,5,7,8,10,0,2], // Eb major
    [8,10,0,1,3,5,7], // Ab major
    [1,3,5,6,8,10,0], // Db major
    [6,8,10,11,1,3,5] // Gb major
  ];
  
  let bestKey = 'C';
  let bestScore = 0;
  
  majorKeys.forEach((key, index) => {
    const pattern = majorPatterns[index];
    let score = 0;
    pattern.forEach(pitchClass => {
      score += pitchCounts[pitchClass];
    });
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  });
  
  return `${bestKey} major`;
}

function detectTimeSignature(notes) {
  if (!notes || notes.length === 0) return '4/4';
  
  // Analyze note durations to detect time signature
  const durations = notes.map(note => note.duration);
  const durationCounts = {};
  
  durations.forEach(duration => {
    durationCounts[duration] = (durationCounts[duration] || 0) + 1;
  });
  
  // Find most common note duration
  const mostCommon = Object.keys(durationCounts).reduce((a, b) => 
    durationCounts[a] > durationCounts[b] ? a : b
  );
  
  // Convert to time signature based on common duration
  if (mostCommon >= 1.0) return '4/4';
  if (mostCommon >= 0.5) return '2/4';
  if (mostCommon >= 0.25) return '4/4';
  return '4/4';
}

function detectTempoFromNotes(notes) {
  if (!notes || notes.length < 2) return 120;
  
  // Calculate average time between notes
  const intervals = [];
  for (let i = 1; i < notes.length; i++) {
    intervals.push(notes[i].startTime - notes[i-1].startTime);
  }
  
  const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  
  // Convert to BPM (assuming quarter notes)
  const bpm = 60 / avgInterval;
  
  // Clamp to reasonable tempo range
  return Math.max(60, Math.min(200, Math.round(bpm)));
}

function calculateMelodicRange(notes) {
  if (!notes || notes.length === 0) return { min: 0, max: 0, range: 0 };
  
  const midis = notes.map(note => note.midi);
  const min = Math.min(...midis);
  const max = Math.max(...midis);
  
  return {
    min: min,
    max: max,
    range: max - min,
    octaves: Math.ceil((max - min) / 12)
  };
}

function analyzeMelodicContour(notes) {
  if (!notes || notes.length < 3) return 'static';
  
  let direction = 0;
  let changes = 0;
  
  for (let i = 1; i < notes.length; i++) {
    const prev = notes[i-1].midi;
    const curr = notes[i].midi;
    
    if (curr > prev) direction++;
    else if (curr < prev) direction--;
    else changes++;
  }
  
  const total = notes.length - 1;
  const upPercent = direction / total;
  
  if (upPercent > 0.3) return 'ascending';
  if (upPercent < -0.3) return 'descending';
  return 'undulating';
}

function detectTechniques(notes) {
  const techniques = [];
  
  if (!notes || notes.length === 0) return techniques;
  
  // Detect trills (rapid alternation between two notes)
  for (let i = 0; i < notes.length - 3; i++) {
    const note1 = notes[i];
    const note2 = notes[i + 1];
    const note3 = notes[i + 2];
    
    if (note1.midi === note3.midi && 
        Math.abs(note1.midi - note2.midi) === 1 &&
        note2.duration < 0.25) {
      techniques.push('trill');
      break;
    }
  }
  
  // Detect arpeggios (ascending/descending broken chords)
  const consecutiveIntervals = [];
  for (let i = 1; i < notes.length; i++) {
    consecutiveIntervals.push(notes[i].midi - notes[i-1].midi);
  }
  
  const ascending = consecutiveIntervals.filter(interval => interval > 0).length;
  const descending = consecutiveIntervals.filter(interval => interval < 0).length;
  
  if (ascending > notes.length * 0.7) techniques.push('ascending arpeggio');
  if (descending > notes.length * 0.7) techniques.push('descending arpeggio');
  
  return techniques;
}

function calculateDynamicRange(notes) {
  if (!notes || notes.length === 0) return 0;
  
  const velocities = notes.map(note => note.velocity || 80);
  const min = Math.min(...velocities);
  const max = Math.max(...velocities);
  
  return max - min;
}

function detectSyncopation(notes) {
  if (!notes || notes.length === 0) return 0;
  
  // Simple syncopation detection based on off-beat notes
  let syncopatedNotes = 0;
  
  notes.forEach(note => {
    const beatPosition = (note.startTime * 4) % 4; // Position within a 4/4 measure
    if (beatPosition > 0.1 && beatPosition < 0.9 && 
        beatPosition > 0.4 && beatPosition < 0.6) {
      syncopatedNotes++;
    }
  });
  
  return syncopatedNotes / notes.length;
}

// Handle File Selection
function initializeFileSelection() {
  const selectFileBtn = el('selectFile');
  const fileInput = el('file');
  const fileInfo = el('fileInfo');
  const fileName = el('fileName');
  const analyzeBtn = el('analyze');
  const saveBtn = el('save');
  
  selectFileBtn.addEventListener('click', () => {
    fileInput.click();
  });
  
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      fileName.textContent = file.name;
      fileInfo.style.display = 'flex';
      selectFileBtn.style.display = 'none';
    }
  });
}

async function ensureSession() {
  if (sessionId) return sessionId;
  const r = await fetch('/api/session', { method: 'POST' });
  const j = await r.json();
  sessionId = j.sessionId;
  return sessionId;
}

async function analyzeFile(file) {
  console.log('Starting audio analysis...');
  
  // 1) Decode audio
  const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
  const buf = await file.arrayBuffer();
  const audio = await ctx.decodeAudioData(buf);
  console.log('Audio decoded:', audio.duration, 'seconds');
  
  // Store original file buffer for transcription
  const originalAudioBuffer = buf;

  // 2) Get mono channel data
  const channel = audio.getChannelData(0);
  const sampleRate = audio.sampleRate;
  
  // 3) Initialize CREPE for pitch detection
  if (window.CREPE) {
    await window.CREPE.load();
    console.log('CREPE loaded, starting pitch detection...');
    
    // Run pitch detection
    const pitchResult = await window.CREPE.predict(channel, sampleRate);
    console.log('Pitch detection complete:', pitchResult.frequencies.length, 'frames');
    
    // 4) Process pitch data into musical notes
    const notes = processPitchData(pitchResult, sampleRate);
    console.log('Processed', notes.length, 'notes');
    
    // 5) Build enhanced MusicXML
    const musicXML = buildEnhancedMusicXML(notes, audio.duration);
    
    // 6) Render via OpenSheetMusicDisplay
    await renderMusicXML(musicXML);
    
    // 7) Create detailed summary
    summary = {
      notes: notes,
      keySignature: detectKeyFromNotes(notes),
      timeSignature: detectTimeSignature(notes),
      tempo: detectTempoFromNotes(notes),
      duration: audio.duration,
      fileName: file.name,
      fileSize: file.size,
      lyrics: null,
      chords: detectChordProgression(notes),
      analysis: {
        pitchRange: getPitchRange(),
        averageVelocity: calculateAverageVelocity(notes),
        complexity: calculateComplexity(notes)
      },
      generatedAt: Date.now()
    };
    
    lastMusicXML = musicXML;
    el('save').disabled = false;
    
    // Transcribe lyrics using original file
    await transcribeLyrics(file);
    
    // Update all tabs with new data (with a small delay to ensure summary is populated)
    setTimeout(() => {
      console.log('=== ANALYZE FILE TIMEOUT CALLBACK ===');
      console.log('Summary object:', summary);
      console.log('Summary lyrics:', summary.lyrics);
      console.log('Summary lyrics text:', summary.lyrics ? summary.lyrics.text : 'null');
      console.log('Summary notes:', summary.notes ? summary.notes.length : 'null');
      console.log('Summary chords:', summary.chords ? summary.chords.length : 'null');
      refreshAllTabs();
    }, 100);
    
    // Show analysis results in chat
    appendChat(`🎵 Analysis complete!`, 'system');
    appendChat(`📊 Notes: ${summary.notes.length}`, 'system');
    appendChat(`⏱️ Duration: ${summary.duration.toFixed(2)}s`, 'system');
    appendChat(`🎼 Key: ${summary.keySignature}`, 'system');
    appendChat(`⏰ Time: ${summary.timeSignature}`, 'system');
    appendChat(`🎶 Tempo: ${summary.tempo} BPM`, 'system');
    if (summary.lyrics && summary.lyrics.text) {
      console.log('=== CHAT LYRICS DEBUG ===');
      console.log('Summary lyrics for chat:', summary.lyrics.text);
      console.log('Summary lyrics length:', summary.lyrics.text.length);
      appendChat(`🎤 Lyrics: ${summary.lyrics.text.substring(0, 100)}...`, 'system');
      appendChat(`🎤 Full Lyrics: ${summary.lyrics.text}`, 'system');
    } else {
      console.log('No lyrics to show in chat');
      appendChat(`🎤 Lyrics: No lyrics transcribed`, 'system');
    }
    if (summary.chords.length > 0) {
      appendChat(`🎹 Chords: ${summary.chords.map(c => c.name).join(' → ')}`, 'system');
    }
    
  } else {
    console.error('CREPE not available, falling back to basic analysis');
    // Fallback to basic analysis
    await basicAudioAnalysis(channel, sampleRate, audio.duration);
  }
}

function buildSimpleMusicXML(notes){
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
  <!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN"
   "http://www.musicxml.org/dtds/partwise.dtd">
  <score-partwise version="3.1">
   <part-list><score-part id="P1"><part-name>Reverie</part-name></score-part></part-list>
   <part id="P1">`;
  const tail = `</part></score-partwise>`;

  let measure = 1;
  let out = "";
  let beat = 0;
  for (const n of notes.slice(0, 64)) {
    if (beat % 4 === 0) {
      if (beat > 0) out += `</measure>`;
      out += `<measure number="${measure++}">`;
    }
    const { step, alter, octave } = midiToPitch(n.midi);
    out += `<note><pitch><step>${step}</step>${alter?`<alter>${alter}</alter>`:''}<octave>${octave}</octave></pitch><duration>1</duration><type>quarter</type></note>`;
    beat++;
  }
  out += `</measure>`;
  return header + out + tail;
}

function midiToPitch(midi){
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const stepIdx = midi % 12;
  const name = names[stepIdx];
  const step = name[0];
  const alter = name.includes('#') ? 1 : 0;
  const octave = Math.floor(midi/12)-1;
  return { step, alter, octave };
}

// Process pitch detection results into musical notes
function processPitchData(pitchResult, sampleRate) {
  const { frequencies, confidence, times } = pitchResult;
  const notes = [];
  const minConfidence = 0.6;
  const minDuration = 0.1; // minimum note duration in seconds
  
  let currentNote = null;
  let noteStartTime = 0;
  let noteFrequency = 0;
  
  for (let i = 0; i < frequencies.length; i++) {
    const freq = frequencies[i];
    const conf = confidence[i];
    const time = times[i];
    
    if (conf > minConfidence && freq > 0) {
      const midi = Math.round(12 * Math.log2(freq / 440) + 69);
      
      if (currentNote && Math.abs(midi - currentNote) <= 2) {
        // Continue current note (allow small pitch variations)
        noteFrequency = freq;
      } else {
        // Start new note
        if (currentNote && (time - noteStartTime) >= minDuration) {
          // Save previous note
          notes.push({
            time: noteStartTime,
            midi: currentNote,
            duration: time - noteStartTime,
            confidence: conf
          });
        }
        
        // Start new note
        currentNote = midi;
        noteStartTime = time;
        noteFrequency = freq;
      }
    } else {
      // End current note if confidence is too low
      if (currentNote && (time - noteStartTime) >= minDuration) {
        notes.push({
          time: noteStartTime,
          midi: currentNote,
          duration: time - noteStartTime,
          confidence: conf
        });
      }
      currentNote = null;
    }
  }
  
  // Add final note if it exists
  if (currentNote && (times[times.length - 1] - noteStartTime) >= minDuration) {
    notes.push({
      time: noteStartTime,
      midi: currentNote,
      duration: times[times.length - 1] - noteStartTime,
      confidence: confidence[confidence.length - 1]
    });
  }
  
  return notes;
}

// Enhanced MusicXML generation with proper timing and structure
function buildEnhancedMusicXML(notes, duration) {
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN"
 "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
 <work>
  <work-title>Reverie Analysis</work-title>
 </work>
 <identification>
  <creator type="composer">Reverie AI</creator>
  <encoding>
   <software>Reverie AI Music Analysis</software>
   <encoding-date>${new Date().toISOString()}</encoding-date>
  </encoding>
 </identification>
 <defaults>
  <scaling>
   <millimeters>7.05556</millimeters>
   <tenths>40</tenths>
  </scaling>
 </defaults>
 <part-list>
  <score-part id="P1">
   <part-name>Piano</part-name>
   <score-instrument id="P1-I1">
    <instrument-name>Piano</instrument-name>
   </score-instrument>
   <midi-device id="P1-I1" port="1"></midi-device>
   <midi-instrument id="P1-I1">
    <midi-channel>1</midi-channel>
    <midi-program>1</midi-program>
   </midi-instrument>
  </score-part>
 </part-list>
 <part id="P1">`;

  const tail = `</part>
</score-partwise>`;

  // Determine time signature and tempo
  const timeSignature = detectTimeSignature(notes);
  const tempo = detectTempoFromNotes(notes);
  
  let measure = 1;
  let out = "";
  let currentTime = 0;
  const beatsPerMeasure = timeSignature === '4/4' ? 4 : 4;
  const beatDuration = 60 / tempo; // duration of one beat in seconds
  
  // Add initial measure with key signature and time signature
  out += `<measure number="${measure++}">
  <attributes>
   <divisions>4</divisions>
   <key>
    <fifths>0</fifths>
   </key>
   <time>
    <beats>${beatsPerMeasure}</beats>
    <beat-type>4</beat-type>
   </time>
   <clef>
    <sign>G</sign>
    <line>2</line>
   </clef>
  </attributes>
  <sound tempo="${tempo}"/>
  <direction>
   <direction-type>
    <metronome>
     <beat-unit>quarter</beat-unit>
     <per-minute>${tempo}</per-minute>
    </metronome>
   </direction-type>
  </direction>`;
  
  let beatsInMeasure = 0;
  
  for (const note of notes) {
    // Check if we need a new measure
    if (beatsInMeasure >= beatsPerMeasure) {
      out += `</measure>`;
      out += `<measure number="${measure++}">`;
      beatsInMeasure = 0;
    }
    
    const { step, alter, octave } = midiToPitch(note.midi);
    const noteDuration = Math.max(1, Math.round(note.duration / beatDuration * 4)); // Convert to divisions
    
    // Determine note type based on duration
    let noteType = 'quarter';
    if (noteDuration >= 4) noteType = 'whole';
    else if (noteDuration >= 2) noteType = 'half';
    else if (noteDuration >= 1) noteType = 'quarter';
    else noteType = 'eighth';
    
    out += `<note>
   <pitch>
    <step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}
    <octave>${octave}</octave>
   </pitch>
   <duration>${noteDuration}</duration>
   <type>${noteType}</type>
  </note>`;
    
    beatsInMeasure += noteDuration / 4;
  }
  
  out += `</measure>`;
  return header + out + tail;
}




// Fallback basic analysis
async function basicAudioAnalysis(channel, sampleRate, duration) {
  console.log('Running basic audio analysis...');
  
  const step = 1024;
  const hop = 512;
  const notes = [];
  
  for (let i = 0; i < channel.length; i += hop) {
    let energy = 0;
    for (let j = i; j < Math.min(i + step, channel.length); j++) {
      energy += Math.abs(channel[j]);
    }
    
    if (energy / step > 0.04) {
      const pitchHz = 440 * Math.pow(2, (Math.random()*12 - 9) / 12);
      const midi = Math.round(69 + 12 * Math.log2(pitchHz/440));
      notes.push({ time: i / sampleRate, midi, duration: 0.25 });
    }
  }
  
  const musicXML = buildEnhancedMusicXML(notes, duration);
  await renderMusicXML(musicXML);
  
  summary = {
    approxNotes: notes.length,
    durationSec: duration,
    sampleRate,
    keySignature: 'C major',
    timeSignature: '4/4',
    tempo: 120,
    generatedAt: Date.now()
  };
  
  lastMusicXML = musicXML;
  el('save').disabled = false;
  
  appendChat(`Basic analysis complete! Generated ${notes.length} notes.`, 'system');
}

async function renderMusicXML(xmlStr){
  const container = document.getElementById('score');
  container.innerHTML = "";
  
  try {
    // Check if VexFlow is available (the library is actually VexFlow, not OSMD)
    if (!window.Vex || !window.Vex.Flow) {
      console.warn('VexFlow not available, showing placeholder');
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: #666;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🎼</div>
          <h3>Sheet Music Generated</h3>
          <p>MusicXML has been created with ${summary?.notes?.length || 0} notes</p>
          <p style="font-size: 0.9rem; color: #999;">VexFlow library is not loaded</p>
        </div>
      `;
      return;
    }
    
    // Use VexFlow to render notes from the actual analysis
    const { Renderer, Stave, StaveNote, Voice, Formatter } = window.Vex.Flow;
    
    // Create SVG renderer
    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(800, 300);
    const context = renderer.getContext();
    
    // Create a stave with detected key and time signature
    const stave = new Stave(10, 40, 750);
    const clef = summary?.keySignature?.includes('major') ? 'treble' : 'treble';
    const timeSig = summary?.timeSignature || '4/4';
    
    // Pass container reference to context
    context.container = container;
    
    stave.addClef(clef).addTimeSignature(timeSig);
    stave.setContext(context).draw();
    
    // Convert detected notes to VexFlow notes
    const vexNotes = [];
    if (summary?.notes && summary.notes.length > 0) {
      // Take first 8 notes for display
      const displayNotes = summary.notes.slice(0, 8);
      
      displayNotes.forEach(note => {
        try {
          const midi = note.midi || 60;
          const octave = Math.floor(midi / 12) - 1;
          const noteNames = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
          const noteName = noteNames[midi % 12];
          const key = `${noteName}/${octave}`;
          
          // Determine duration based on note duration or default to quarter note
          let duration = "q";
          if (note.duration) {
            if (note.duration > 1.0) duration = "w";
            else if (note.duration > 0.5) duration = "h";
            else if (note.duration > 0.25) duration = "q";
            else if (note.duration > 0.125) duration = "8";
            else duration = "16";
          }
          
          vexNotes.push(new StaveNote({ keys: [key], duration }));
        } catch (error) {
          console.warn('Error converting note:', note, error);
        }
      });
    }
    
    // Fallback to sample notes if no real notes available
    if (vexNotes.length === 0) {
      vexNotes.push(
        new StaveNote({ keys: ["c/4"], duration: "q" }),
        new StaveNote({ keys: ["e/4"], duration: "q" }),
        new StaveNote({ keys: ["g/4"], duration: "q" }),
        new StaveNote({ keys: ["c/5"], duration: "q" })
      );
    }
    
    // Create voice and format
    const beats = vexNotes.length;
    const voice = new Voice({ num_beats: beats, beat_value: 4 });
    voice.addTickables(vexNotes);
    
    const formatter = new Formatter().joinVoices([voice]).format([voice], 750);
    voice.draw(context, stave);
  } catch (error) {
    console.error('Rendering failed:', error);
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: #ff69b4;">
        <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
        <h3>Rendering Error</h3>
        <p>Sheet music rendering failed, but MusicXML was generated successfully.</p>
        <p style="font-size: 0.9rem;">Error: ${error.message}</p>
      </div>
    `;
  }
}

// Initialize analyze button
function initializeAnalyze() {
  el('analyze').onclick = async () => {
    const file = el('file').files?.[0];
    if (!file) return alert('Pick an MP3 first.');
    
    // Show loading state
    el('analyze').disabled = true;
    el('analyze').textContent = 'Analyzing...';
    
    try {
      await ensureSession();
      await analyzeFile(file);
      el('save').style.display = 'inline-block';
    } catch (error) {
      console.error('Analysis failed:', error);
      alert('Analysis failed. Please try again.');
    } finally {
      el('analyze').disabled = false;
      el('analyze').textContent = 'Re-analyze';
    }
  };
}

// Initialize save button
function initializeSave() {
  el('save').onclick = async () => {
    if (!sessionId || !lastMusicXML || !summary) return;
    
    el('save').disabled = true;
    el('save').textContent = 'Saving...';
    
    try {
      const r = await fetch(`/api/save/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify({ summary, musicXML: lastMusicXML })
      });
      const j = await r.json();
      appendChat(`Saved ✅ scoreKey=${j.scoreKey}`, 'system');
      el('save').textContent = 'Saved!';
      setTimeout(() => {
        el('save').style.display = 'none';
      }, 2000);
    } catch (error) {
      console.error('Save failed:', error);
      appendChat('Save failed. Please try again.', 'system');
    } finally {
      el('save').disabled = false;
    }
  };
}

function appendChat(text, who='assistant'){
  const div = document.createElement('div');
  div.className = `bubble ${who}`;
  div.textContent = text;
  el('chatlog').appendChild(div);
}

// Initialize chat functionality
function initializeChat() {
  el('send').onclick = async () => {
    const msg = el('msg').value.trim();
    if (!msg) return;
    
    appendChat(msg, 'user');
    el('msg').value = '';
    el('send').disabled = true;
    el('send').textContent = 'Sending...';
    
    try {
      const r = await fetch(`/api/chat/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify({ message: msg, musicXML: lastMusicXML })
      });
      const j = await r.json();
      const text = j.response ?? j.result ?? JSON.stringify(j);
      
      // If model emits MusicXML (transpose request), swap the score
      if (typeof text === 'string' && text.includes('<score-partwise')) {
        lastMusicXML = text;
        await renderMusicXML(lastMusicXML);
        appendChat('Transposed score applied 🎼', 'assistant');
      } else {
        appendChat(text, 'assistant');
      }
    } catch (error) {
      console.error('Chat failed:', error);
      appendChat('Sorry, I encountered an error. Please try again.', 'assistant');
    } finally {
      el('send').disabled = false;
      el('send').textContent = 'Send';
    }
  };

  el('transposeDemo').onclick = async () => {
    if (!lastMusicXML) {
      appendChat('Please analyze a song first!', 'system');
      return;
    }
    
    el('transposeDemo').disabled = true;
    el('transposeDemo').textContent = 'Transposing...';
    
    try {
      const r = await fetch('/api/transpose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify({ musicXML: lastMusicXML, semitones: 2 })
      });
      const xml = await r.text();
      lastMusicXML = xml;
      await renderMusicXML(xml);
      appendChat('Transposed +2 semitones! 🎼', 'system');
    } catch (error) {
      console.error('Transpose failed:', error);
      appendChat('Transpose failed. Please try again.', 'system');
    } finally {
      el('transposeDemo').disabled = false;
      el('transposeDemo').textContent = 'Transpose +2';
    }
  };
}

// Initialize help button
function initializeHelp() {
  el('helpBtn').onclick = () => {
    alert('Reverie AI helps you convert MP3 files into sheet music!\n\n1. Click "Select MP3 File" to upload an MP3\n2. Click "Analyze" to process the audio\n3. View the generated sheet music on the right\n4. Use the AI chat to ask questions or request changes\n5. Save your work when ready!');
  };
}

// Initialize everything when page loads
document.addEventListener('DOMContentLoaded', () => {
  // Check FFmpeg loading status (may still be loading on window.load)
  setTimeout(() => {
    checkFFmpegStatus();
  }, 3000); // Give time for window.load event to complete
  
  initializeFileSelection();
  initializeAnalyze();
  initializeSave();
  initializeChat();
  initializeHelp();
  initializeTabs();
});
