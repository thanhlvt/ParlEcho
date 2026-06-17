/**
 * LiveClient — bộ điều khiển WebSocket cho Gemini Live API.
 * Tách hoàn toàn khỏi React để có thể unit-test và tái sử dụng dễ hơn.
 *
 * Luồng:
 *  1. start() → gọi Edge Function /live-token để lấy ephemeral token
 *  2. Mở WSS với access_token
 *  3. Nhận audio PCM24 từ Gemini → gọi onAudioChunk (UI play)
 *  4. Mic PCM16 chunks → send vào socket + buffer để review cuối phiên
 *  5. stop() → đóng socket, trả về dữ liệu để persist + gọi /session-review
 *
 * NOTE: Mic streaming thực tế cần EAS dev build + native audio lib
 * (@siteed/expo-audio-studio hoặc tương đương). File này chỉ định nghĩa
 * interface và logic WebSocket/protocol — việc capture mic là trách nhiệm
 * của UI layer gọi sendAudioChunk().
 */

import { supabase } from './supabase';
import { LiveAudioSegment, LiveTokenApiResponse, LiveTurn } from './types';

// WAV header 16kHz mono 16-bit (dùng cho user audio segment khi lưu)
function buildWavHeader(pcmByteLength: number): Uint8Array {
  const sampleRate = 16000;
  const numChannels = 1;
  const bitDepth = 16;
  const byteRate = sampleRate * numChannels * (bitDepth / 8);
  const blockAlign = numChannels * (bitDepth / 8);

  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };

  w(0, 'RIFF'); v.setUint32(4, 36 + pcmByteLength, true);
  w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, numChannels, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, byteRate, true);
  v.setUint16(32, blockAlign, true); v.setUint16(34, bitDepth, true);
  w(36, 'data'); v.setUint32(40, pcmByteLength, true);

  return new Uint8Array(header);
}

function pcmToWav(pcm: Uint8Array): Uint8Array {
  const header = buildWavHeader(pcm.length);
  const wav = new Uint8Array(44 + pcm.length);
  wav.set(header, 0);
  wav.set(pcm, 44);
  return wav;
}

// Ghép nhiều Uint8Array thành một
function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

export type LiveState = 'idle' | 'connecting' | 'live' | 'ended' | 'error';

export interface LiveClientCallbacks {
  onStateChange: (state: LiveState) => void;
  /** PCM24 chunk từ Gemini → UI play */
  onAudioChunk: (pcm24Base64: string) => void;
  /** Transcript realtime (cả hai phía) */
  onTranscriptUpdate: (turns: LiveTurn[]) => void;
  onError: (msg: string) => void;
  /** Barge-in: AI bị ngắt → UI nên clear audio queue */
  onInterrupted?: () => void;
}

export interface LiveSessionResult {
  conversationId: string;
  turns: LiveTurn[];
  userSegments: LiveAudioSegment[];
}

// Ephemeral token endpoint requires BidiGenerateContentConstrained (not BidiGenerateContent)
// source: ai.google.dev/gemini-api/docs/live-api/get-started-websocket
const WSS_BASE =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';

export class LiveClient {
  private ws: WebSocket | null = null;
  private cb: LiveClientCallbacks;

  // Transcript accumulator
  private turns: LiveTurn[] = [];
  private currentUserText = '';
  private currentAiText = '';
  private turnOrder = 0;

  // Audio capture buffers per user turn
  private userPcmChunks: Uint8Array[] = [];
  private userAudioSegments: Array<{ pcm: Uint8Array; text: string; order: number }> = [];

  // Barge-in flag — khi AI bị ngắt, buffer hiện tại bị hủy
  private aiSpeaking = false;
  // Track audio buffer to calculate how long to keep mic muted after generationComplete
  private aiAudioStartTime = 0;
  private aiAudioByteCount = 0;

  constructor(cb: LiveClientCallbacks) {
    this.cb = cb;
  }

  // ── Public API ────────────────────────────────────────────────────────

  async start(opts: {
    languageId: string;
    topic?: string;
    voice?: string;
    speakingStyle?: string;
    conversationMethod?: string;
    accent?: string;
  }) {
    this.cb.onStateChange('connecting');

    // 1. Lấy ephemeral token từ Edge Function
    const { data, error } = await supabase.functions.invoke<LiveTokenApiResponse>('live-token', {
      body: {
        language_id: opts.languageId,
        topic: opts.topic ?? '',
        voice_id: opts.voice,
        speaking_style: opts.speakingStyle,
        conversation_method: opts.conversationMethod,
        accent: opts.accent,
      },
    });

    if (error || !data) {
      this.cb.onStateChange('error');
      this.cb.onError(error?.message ?? 'Cannot get live token');
      return;
    }

    // 2. Mở WebSocket với access_token (ephemeral token)
    const url = `${WSS_BASE}?access_token=${encodeURIComponent(data.token)}`;
    this.ws = new WebSocket(url);
    // Gemini Live sends JSON as binary WebSocket frames — request ArrayBuffer for easy decoding
    (this.ws as WebSocket & { binaryType: string }).binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      console.log('[LiveClient] WS opened, sending setup. model=', data.model, 'voice=', data.voice);
      this._send({
        setup: {
          model: data.model,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: data.voice },
              },
            },
          },
          systemInstruction: {
            parts: [{ text: data.system_instruction }],
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      });
      this.cb.onStateChange('live');
    };

    this.ws.onmessage = (ev) => {
      let text: string;
      if (typeof ev.data === 'string') {
        text = ev.data;
      } else if (ev.data instanceof ArrayBuffer) {
        // Gemini sends JSON inside binary WebSocket frames — decode as UTF-8
        try {
          text = new TextDecoder('utf-8').decode(ev.data);
        } catch (e) {
          console.warn('[LiveClient] Failed to decode ArrayBuffer frame:', e);
          return;
        }
      } else {
        console.warn('[LiveClient] Unknown frame type:', typeof ev.data, Object.prototype.toString.call(ev.data));
        return;
      }
      console.log('[LiveClient] Message text:', text.substring(0, 200));
      this._handleMessage(text);
    };

    this.ws.onerror = (ev) => {
      console.error('[LiveClient] WebSocket error', ev);
      this.cb.onStateChange('error');
      this.cb.onError('WebSocket error');
    };

    this.ws.onclose = (ev) => {
      console.log(`[LiveClient] WS closed code=${ev.code} reason="${ev.reason}"`);
      // Only act if ws is still set (user calling stop() nulls it out first)
      if (this.ws !== null) {
        if (ev.code === 1000) {
          // Normal session end from Gemini — don't show error; let audio finish playing
          // The UI stays on the live screen so the user can press End when ready
          this.cb.onStateChange('ended');
        } else {
          this.cb.onStateChange('error');
          this.cb.onError(`Kết nối đóng (code ${ev.code}${ev.reason ? ': ' + ev.reason : ''})`);
        }
      }
    };
  }

  /**
   * Gửi chunk mic PCM16 (16kHz, mono, little-endian) dạng base64.
   * Gọi từ UI mỗi khi native audio lib phát ra một chunk.
   */
  sendAudioChunk(pcm16Base64: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    // Gate mic while AI audio is still playing to prevent speaker echo being fed back to
    // Gemini (hardware AEC alone is not reliable on all devices / Android).
    // The gate is cleared by: drain timer, inputTranscription arrival, or empty serverContent.
    if (this.aiSpeaking) return;

    // Buffer để review cuối phiên
    const bytes = Uint8Array.from(atob(pcm16Base64), (c) => c.charCodeAt(0));
    this.userPcmChunks.push(bytes);

    this._send({
      realtimeInput: {
        audio: { data: pcm16Base64, mimeType: 'audio/pcm;rate=16000' },
      },
    });
  }

  /**
   * Dừng phiên. Trả về data để UI persist + gọi /session-review.
   * Upload audio segments cần được thực hiện bởi UI sau khi nhận result.
   */
  stop(): { turns: LiveTurn[]; rawUserSegments: Array<{ pcm: Uint8Array; text: string; order: number }> } {
    if (this.ws) {
      // Only close if still open — server may have already closed with code=1000
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, 'Session ended by user');
      }
      this.ws = null;
    }
    this._flushCurrentUserTurn();
    this.cb.onStateChange('ended');
    return {
      turns: [...this.turns],
      rawUserSegments: [...this.userAudioSegments],
    };
  }

  // ── Message parsing ───────────────────────────────────────────────────

  private _handleMessage(raw: string) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // setupComplete confirms the session is ready
    if (msg.setupComplete !== undefined) {
      console.log('[LiveClient] setupComplete received — session ready');
      return;
    }

    const sc = msg.serverContent as Record<string, unknown> | undefined;
    if (!sc) {
      console.log('[LiveClient] Non-serverContent message keys:', Object.keys(msg).join(','));
      return;
    }

    // Barge-in: AI bị ngắt → discard current AI audio
    if (sc.interrupted) {
      this.aiSpeaking = false;
      this.aiAudioByteCount = 0;
      this.currentAiText = '';
      this.cb.onInterrupted?.();
    }

    const modelTurn = sc.modelTurn as { parts?: Array<Record<string, unknown>> } | undefined;
    if (modelTurn?.parts) {
      for (const part of modelTurn.parts) {
        // Audio PCM24 → UI play
        const inlineData = part.inlineData as { mimeType?: string; data?: string } | undefined;
        if (inlineData?.data) {
          if (!this.aiSpeaking) {
            this.aiSpeaking = true;
            this.aiAudioStartTime = Date.now();
            this.aiAudioByteCount = 0;
          }
          // base64 → PCM byte count (Gemini outputs 24 kHz 16-bit mono = 48000 B/s)
          this.aiAudioByteCount += Math.ceil(inlineData.data.length * 3 / 4);
          this.cb.onAudioChunk(inlineData.data);
        }
      }
    }

    // Input transcription (user speech recognized by Gemini)
    const inputTx = sc.inputTranscription as { text?: string } | undefined;
    if (inputTx?.text) {
      this.currentUserText += inputTx.text;
      // Gemini confirmed it's receiving user audio — cancel any stale aiSpeaking flag
      if (this.aiSpeaking) {
        this.aiSpeaking = false;
        this.aiAudioByteCount = 0;
      }
      // Emit live preview immediately so the user bubble appears before the AI responds.
      // _flushCurrentUserTurn() will later add this as a permanent turn; the UI sees a
      // seamless update because the text is the same.
      this.cb.onTranscriptUpdate([
        ...this.turns,
        { role: 'user', text: this.currentUserText, sort_order: this.turnOrder },
      ]);
    }

    // Output transcription (AI reply text)
    const outputTx = sc.outputTranscription as { text?: string } | undefined;
    if (outputTx?.text) {
      this.currentAiText += outputTx.text;
    }

    // Empty serverContent {} = Gemini acknowledged receipt but produced no content.
    // This happens when the AI decides not to respond for a turn, or as a session keepalive.
    // Clear any stale aiSpeaking flag so the next user turn is not blocked.
    if (!sc.interrupted && !sc.modelTurn && !sc.inputTranscription &&
        !sc.outputTranscription && !sc.turnComplete && !sc.generationComplete) {
      if (this.aiSpeaking) {
        this.aiSpeaking = false;
        this.aiAudioByteCount = 0;
      }
    }

    // turnComplete OR generationComplete = AI finished its turn, ready for next input
    if (sc.turnComplete || sc.generationComplete) {
      this._flushCurrentUserTurn();
      if (this.currentAiText.trim()) {
        this.turns.push({
          role: 'assistant',
          text: this.currentAiText.trim(),
          sort_order: this.turnOrder++,
        });
        this.currentAiText = '';
      }
      // Delay re-enabling mic until buffered audio finishes playing.
      // totalAudioMs = byte count / 48000 B/s (24 kHz 16-bit mono).
      // elapsedMs = time since first chunk arrived — already-played portion.
      // +200 ms safety buffer for playback queue flush; no artificial minimum
      // so the gate closes immediately if audio was short or already done.
      const totalAudioMs = (this.aiAudioByteCount / 48000) * 1000;
      const elapsedMs = Date.now() - this.aiAudioStartTime;
      const remainingMs = Math.max(0, totalAudioMs - elapsedMs + 200);
      this.aiAudioByteCount = 0;
      setTimeout(() => { this.aiSpeaking = false; }, remainingMs);
      this.cb.onTranscriptUpdate([...this.turns]);
    }
  }

  private _flushCurrentUserTurn() {
    const text = this.currentUserText.trim();
    if (text || this.userPcmChunks.length > 0) {
      const pcm = concat(this.userPcmChunks);
      this.userAudioSegments.push({ pcm, text, order: this.turnOrder });
      if (text) {
        this.turns.push({ role: 'user', text, sort_order: this.turnOrder });
        this.turnOrder++;
      }
      this.currentUserText = '';
      this.userPcmChunks = [];
    }
  }

  private _send(payload: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }
}

// ── Upload helpers (dùng trong UI sau khi stop()) ────────────────────

/**
 * Wrap PCM16 bytes thành WAV rồi upload lên Storage "recordings".
 * Trả về storage path (dùng cho /session-review).
 */
export async function uploadLiveSegment(
  userId: string,
  conversationId: string,
  order: number,
  pcm: Uint8Array,
): Promise<string> {
  const wav = pcmToWav(pcm);
  const path = `${userId}/live/${conversationId}/${order}.wav`;

  // Upload qua XHR (cách duy nhất đáng tin cậy trên React Native cho ArrayBuffer)
  const arrayBuffer = wav.buffer as ArrayBuffer;

  const { error } = await supabase.storage
    .from('recordings')
    .upload(path, arrayBuffer, { contentType: 'audio/wav', upsert: true });

  if (error) throw new Error(error.message);
  return path;
}
