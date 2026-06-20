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
import { logError } from './sentry';
import { buildWavHeader, pcmToWav, bytesToBase64 } from './audioFormat';
import { stripStepDoneMarker, stripOffTopicMarker } from './markerProtocol';
import { LiveAudioSegment, LiveTokenApiResponse, LiveTurn } from './types';

export { buildWavHeader, pcmToWav, bytesToBase64 };

// Ghép nhiều Uint8Array thành một
function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

export type LiveState = 'idle' | 'connecting' | 'live' | 'ended' | 'error';

// Kid Mode (guided): marker AI chèn cuối lời nói (qua outputTranscription) để báo tiến trình
// nhiệm vụ — `[STEP_DONE]` (xong bước) và `[OFFTOPIC]` (lạc đề), khớp với live-token/index.ts.
// Match FUZZY (xem lib/markerProtocol.ts) vì output chỉ là AUDIO nên marker phải qua vòng
// audio→transcription, model có thể đọc trại hoặc transcription bỏ ngoặc/đổi gạch dưới.
// KHÔNG dùng function-calling: model Live 3.1 chỉ hỗ trợ FC blocking và không nói tiếp sau
// toolResponse (treo phiên).
// PHẢI khớp STEP_DONE_MARKER trong supabase/functions/live-token/index.ts — dùng khi soạn
// reminder gửi lại cho model (xem _sendStepReminder).
const STEP_DONE_MARKER = '[STEP_DONE]';

// Model có thể quên gắn [STEP_DONE] khi hội thoại kéo dài (instruction drift của Live API).
// Sau N lượt AI liên tiếp không thấy marker dù vẫn ở cùng bước, gửi 1 lần reminder ẩn nhắc
// lại mục tiêu bước hiện tại; sau M lượt vẫn không có marker thì coi như model bị kẹt và tự
// force-advance ở client để progress bar không treo vĩnh viễn.
const STEP_REMINDER_AFTER_TURNS = 2;
const STEP_FORCE_ADVANCE_AFTER_TURNS = 4;

// Image Exploration (Pha 5): câu mở đầu cố định gửi kèm ảnh qua clientContent — chỉ là
// chỉ dẫn nội bộ cho model, không hiển thị cho trẻ (không qua inputAudioTranscription).
export const EXPLORATION_OPENING_TEXT =
  'Here is a picture for the child to look at. Start the activity now by asking your first question about it.';

export interface LiveClientCallbacks {
  onStateChange: (state: LiveState) => void;
  /** PCM24 chunk từ Gemini → UI play */
  onAudioChunk: (pcm24Base64: string) => void;
  /** Transcript realtime (cả hai phía) */
  onTranscriptUpdate: (turns: LiveTurn[]) => void;
  onError: (msg: string) => void;
  /** Barge-in: AI bị ngắt → UI nên clear audio queue */
  onInterrupted?: () => void;
  /** Kid Mode (guided): hết `turnLimitSec` mà trẻ chưa nói gì ở lượt của mình */
  onTurnTimeout?: () => void;
  /** Kid Mode (guided): AI báo đã hoàn thành bước hiện tại, sang bước kế */
  onStepAdvance?: () => void;
  /**
   * Audio buffer của lượt AI vừa xong đã phát hết (cùng mốc dùng để mở lại mic) — dùng để
   * trì hoãn các hành động như kết thúc phiên cho tới khi AI nói xong, tránh cắt ngang giữa câu.
   */
  onAiAudioDone?: () => void;
  /**
   * Kid Mode (guided): AI báo trẻ đang lạc đề; streak = số lượt liên tiếp lạc đề,
   * sortOrder = sort_order của lượt AI này (dùng để Parent Dashboard đánh dấu, Pha 6)
   */
  onOffTopic?: (streak: number, sortOrder: number) => void;
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

  // Audio capture buffers per AI turn
  private aiPcmChunks: Uint8Array[] = [];
  private aiAudioSegments: Array<{ pcm: Uint8Array; text: string; order: number }> = [];

  // Barge-in flag — khi AI bị ngắt, buffer hiện tại bị hủy
  private aiSpeaking = false;
  // Track audio buffer to calculate how long to keep mic muted after generationComplete
  private aiAudioStartTime = 0;
  private aiAudioByteCount = 0;

  // Kid Mode (guided): timer nhắc khi tới lượt trẻ mà im lặng quá lâu
  private turnLimitMs = 0;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private offTopicStreak = 0;

  // Kid Mode (guided): theo dõi bước hiện tại để soạn reminder + force-advance khi model
  // quên gắn marker (xem STEP_REMINDER_AFTER_TURNS/STEP_FORCE_ADVANCE_AFTER_TURNS).
  private missionSteps: { stepOrder: number; targetSentence: string; intent: string }[] = [];
  private stepIndex = 0;
  private turnsSinceStepEvent = 0;
  private reminderSentForCurrentStep = false;
  private lastFlushAdvancedStep = false;
  // Kid Mode: server cấu hình activityHandling = NO_INTERRUPTION. Khi true, KHÔNG gỡ cờ
  // aiSpeaking dựa trên inputTranscription lúc AI đang nói — tránh tiếng AI vọng vào mic bị
  // hiểu là trẻ nói (echo) làm mở mic giữa chừng. Chỉ drain-timer sau turnComplete mở lại mic.
  private noInterruption = false;

  // Kid Mode (Image Exploration): chỉ gửi ảnh sau khi server xác nhận setupComplete thật
  // (KHÔNG nhét vào setup message — xem plan.md Pha 5 / spike-live-image.mjs).
  private setupReady = false;
  private pendingImageTurn: { base64: string; mimeType: string; text: string } | null = null;

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
    /** Kid Mode: 'kid_guided' để live-token build system prompt theo mission */
    mode?: string;
    mission?: {
      title: string;
      topic: string;
      steps: { stepOrder: number; targetSentence: string; intent: string }[];
    };
    companionName?: string;
    companionPersonality?: string;
    /** Kid Mode (guided): giây tối đa chờ trẻ nói ở lượt của mình trước khi nudge */
    turnLimitSec?: number;
    /** Kid Mode (exploration): 'beginner' | 'intermediate' — scale độ khó câu hỏi */
    childLevel?: string;
  }) {
    this.turnLimitMs = (opts.turnLimitSec ?? 0) * 1000;
    this.offTopicStreak = 0;
    this.noInterruption = opts.mode === 'kid_guided' || opts.mode === 'kid_exploration';
    this.setupReady = false;
    this.pendingImageTurn = null;
    this.missionSteps = [...(opts.mission?.steps ?? [])].sort((a, b) => a.stepOrder - b.stepOrder);
    this.stepIndex = 0;
    this.turnsSinceStepEvent = 0;
    this.reminderSentForCurrentStep = false;
    this.lastFlushAdvancedStep = false;
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
        mode: opts.mode,
        mission: opts.mission,
        companion_name: opts.companionName,
        companion_personality: opts.companionPersonality,
        child_level: opts.childLevel,
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
      console.log(
        '[LiveClient] WS opened, sending setup. model=',
        data.model,
        'voice=',
        data.voice,
      );
      // Kid Mode: phòng AI tự lặp lại câu vừa nói + nói sai lượt. temperature thấp giảm xu
      // hướng "lan man"; maxOutputTokens là lưới an toàn cuối (chỉ cắt cụt câu, không ngăn lặp).
      // realtimeInputConfig là lớp chính: trẻ nói chậm/ngắt quãng nên silenceDurationMs cao để
      // model không kết luận trẻ nói xong rồi chen vào; sensitivity LOW để echo/ồn ít kích hoạt
      // nhầm VAD; NO_INTERRUPTION để tiếng AI vọng vào mic không "ngắt" model khiến nó nói lại
      // câu từ đầu. Chỉ áp cho Kid Mode — Live tự do (adult) giữ mặc định để cho phép barge-in.
      const isKidMode = opts.mode === 'kid_guided' || opts.mode === 'kid_exploration';
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
            ...(isKidMode ? { temperature: 0.6, maxOutputTokens: 500 } : {}),
          },
          systemInstruction: {
            parts: [{ text: data.system_instruction }],
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          ...(isKidMode
            ? {
                realtimeInputConfig: {
                  automaticActivityDetection: {
                    startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
                    endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
                    silenceDurationMs: 1500,
                    prefixPaddingMs: 300,
                  },
                  activityHandling: 'NO_INTERRUPTION',
                },
              }
            : {}),
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
        console.warn(
          '[LiveClient] Unknown frame type:',
          typeof ev.data,
          Object.prototype.toString.call(ev.data),
        );
        return;
      }
      console.log('[LiveClient] Message text:', text.substring(0, 200));
      this._handleMessage(text);
    };

    this.ws.onerror = (ev) => {
      logError('LiveClient.websocket', ev);
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
   * Kid Mode (Image Exploration): gửi MỘT user turn chứa ảnh + câu mở đầu, dạng
   * clientContent (KHÔNG nhét vào setup message). Nếu server chưa xác nhận
   * setupComplete, request được queue và tự gửi ngay khi setupComplete tới
   * (xem _handleMessage).
   */
  sendImageTurn(base64: string, mimeType: string, text: string) {
    if (this.setupReady) {
      this._sendImageTurnNow(base64, mimeType, text);
    } else {
      this.pendingImageTurn = { base64, mimeType, text };
    }
  }

  private _sendImageTurnNow(base64: string, mimeType: string, text: string) {
    this._send({
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [{ inlineData: { mimeType, data: base64 } }, { text }],
          },
        ],
        turnComplete: true,
      },
    });
  }

  /**
   * Dừng phiên. Trả về data để UI persist + gọi /session-review.
   * Upload audio segments cần được thực hiện bởi UI sau khi nhận result.
   */
  stop(): {
    turns: LiveTurn[];
    rawUserSegments: Array<{ pcm: Uint8Array; text: string; order: number }>;
    rawAiSegments: Array<{ pcm: Uint8Array; text: string; order: number }>;
  } {
    if (this.ws) {
      // Only close if still open — server may have already closed with code=1000
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, 'Session ended by user');
      }
      this.ws = null;
    }
    this._clearTurnTimer();
    this._flushCurrentUserTurn();
    this._flushCurrentAiTurn();
    this.cb.onStateChange('ended');
    return {
      turns: [...this.turns],
      rawUserSegments: [...this.userAudioSegments],
      rawAiSegments: [...this.aiAudioSegments],
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

    // setupComplete confirms the session is ready — only NOW is it safe to send the
    // image turn (sending it inside/before setup is not supported by the API).
    if (msg.setupComplete !== undefined) {
      console.log('[LiveClient] setupComplete received — session ready');
      this.setupReady = true;
      if (this.pendingImageTurn) {
        const { base64, mimeType, text } = this.pendingImageTurn;
        this.pendingImageTurn = null;
        this._sendImageTurnNow(base64, mimeType, text);
      }
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
          const bytes = Uint8Array.from(atob(inlineData.data), (c) => c.charCodeAt(0));
          this.aiPcmChunks.push(bytes);
          this.aiAudioByteCount += Math.ceil((inlineData.data.length * 3) / 4);
          this.cb.onAudioChunk(inlineData.data);
        }
      }
    }

    // Input transcription (user speech recognized by Gemini)
    const inputTx = sc.inputTranscription as { text?: string } | undefined;
    // Kid Mode (NO_INTERRUPTION): trong lúc AI còn đang nói, mọi inputTranscription gần như chắc
    // chắn là echo tiếng AI vọng vào mic — bỏ qua hẳn (không cộng text, không mở mic), để
    // drain-timer sau turnComplete mới mở lại mic. Tránh vòng lặp echo gây AI lặp lời/sai lượt.
    if (inputTx?.text && this.noInterruption && this.aiSpeaking) {
      // bỏ qua như echo
    } else if (inputTx?.text) {
      this.currentUserText += inputTx.text;
      // Trẻ đã bắt đầu nói ở lượt của mình — không cần nudge nữa
      this._clearTurnTimer();
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
    if (
      !sc.interrupted &&
      !sc.modelTurn &&
      !sc.inputTranscription &&
      !sc.outputTranscription &&
      !sc.turnComplete &&
      !sc.generationComplete
    ) {
      if (this.aiSpeaking) {
        this.aiSpeaking = false;
        this.aiAudioByteCount = 0;
      }
    }

    // turnComplete OR generationComplete = AI finished its turn, ready for next input
    if (sc.turnComplete || sc.generationComplete) {
      this._flushCurrentUserTurn();
      this._flushCurrentAiTurn();
      this._checkStepProgress();
      // Delay re-enabling mic until buffered audio finishes playing.
      // totalAudioMs = byte count / 48000 B/s (24 kHz 16-bit mono).
      // elapsedMs = time since first chunk arrived — already-played portion.
      // +500 ms safety buffer for playback queue flush + speaker/room echo decay
      // (hardware AEC doesn't fully cancel the tail, so the mic can otherwise pick
      // up the last fraction of a second of the AI's own voice as a "user" turn).
      // A 300 ms floor guards the case where elapsedMs already exceeds totalAudioMs
      // (slow/jittery network delivery), which would otherwise compute ~0 delay.
      const totalAudioMs = (this.aiAudioByteCount / 48000) * 1000;
      const elapsedMs = Date.now() - this.aiAudioStartTime;
      const remainingMs = Math.max(300, totalAudioMs - elapsedMs + 500);
      this.aiAudioByteCount = 0;
      setTimeout(() => {
        this.aiSpeaking = false;
        // Mic vừa được mở lại — bắt đầu đếm lượt của trẻ (Kid Mode guided)
        this._startTurnTimer();
        this.cb.onAiAudioDone?.();
      }, remainingMs);
      this.cb.onTranscriptUpdate([...this.turns]);
    }
  }

  // Kid Mode (guided): gọi sau mỗi lượt AI hoàn tất. Nếu lượt này KHÔNG có marker
  // [STEP_DONE] (lastFlushAdvancedStep=false) trong khi vẫn còn bước chưa xong, đếm dồn —
  // tới STEP_REMINDER_AFTER_TURNS thì nhắc model 1 lần, tới STEP_FORCE_ADVANCE_AFTER_TURNS
  // thì coi như model bị kẹt và tự advance ở client để progress bar không treo vĩnh viễn.
  private _checkStepProgress() {
    if (this.missionSteps.length === 0 || this.stepIndex >= this.missionSteps.length) return;

    if (this.lastFlushAdvancedStep) {
      this.turnsSinceStepEvent = 0;
      return;
    }

    this.turnsSinceStepEvent++;
    if (this.turnsSinceStepEvent >= STEP_FORCE_ADVANCE_AFTER_TURNS) {
      console.warn('[LiveClient] Step marker not seen for too long — forcing advance');
      this.turnsSinceStepEvent = 0;
      this.reminderSentForCurrentStep = false;
      this.offTopicStreak = 0;
      this.stepIndex = Math.min(this.stepIndex + 1, this.missionSteps.length);
      this.cb.onStepAdvance?.();
    } else if (
      this.turnsSinceStepEvent >= STEP_REMINDER_AFTER_TURNS &&
      !this.reminderSentForCurrentStep
    ) {
      this.reminderSentForCurrentStep = true;
      this._sendStepReminder();
    }
  }

  // Gửi nhắc ẩn về mục tiêu bước hiện tại — dùng clientContent role "user" giống cơ chế
  // EXPLORATION_OPENING_TEXT (chỉ dẫn nội bộ cho model, model được yêu cầu không nói lại
  // nguyên văn cho trẻ nghe).
  private _sendStepReminder() {
    const step = this.missionSteps[this.stepIndex];
    if (!step) return;
    const text =
      `(Reminder for you, the AI — do not say this out loud or mention it to the child): ` +
      `You are still on Step ${step.stepOrder} — goal: "${step.targetSentence}" (reached when ${step.intent}). ` +
      `If the child's last reply already satisfies this goal, praise them now, move on to the next step, ` +
      `and remember to append the exact text "${STEP_DONE_MARKER}" at the end of your next reply.`;
    this._send({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      },
    });
  }

  private _startTurnTimer() {
    if (this.turnLimitMs <= 0) return;
    this._clearTurnTimer();
    this.turnTimer = setTimeout(() => {
      this.cb.onTurnTimeout?.();
    }, this.turnLimitMs);
  }

  private _clearTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
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

  private _flushCurrentAiTurn() {
    const rawText = this.currentAiText.trim();
    const text = this._consumeMarkers(rawText);
    if (text || this.aiPcmChunks.length > 0) {
      const pcm = concat(this.aiPcmChunks);
      this.aiAudioSegments.push({ pcm, text, order: this.turnOrder });
      if (text) {
        this.turns.push({
          role: 'assistant',
          text: text,
          sort_order: this.turnOrder++,
        });
      }
      this.currentAiText = '';
      this.aiPcmChunks = [];
    }
  }

  // Kid Mode (guided): tách marker tiến trình khỏi text hiển thị/lưu trữ + bắn callback.
  // Fuzzy-match thực tế nằm ở lib/markerProtocol.ts (pure, có unit test riêng).
  private _consumeMarkers(text: string): string {
    let cleaned = text;
    this.lastFlushAdvancedStep = false;

    const step = stripStepDoneMarker(cleaned);
    if (step.matched) {
      cleaned = step.cleaned;
      this.offTopicStreak = 0;
      this.lastFlushAdvancedStep = true;
      this.stepIndex = Math.min(this.stepIndex + 1, this.missionSteps.length);
      this.turnsSinceStepEvent = 0;
      this.reminderSentForCurrentStep = false;
      this.cb.onStepAdvance?.();
    }

    const offTopic = stripOffTopicMarker(cleaned);
    if (offTopic.matched) {
      cleaned = offTopic.cleaned;
      this.offTopicStreak++;
      this.cb.onOffTopic?.(this.offTopicStreak, this.turnOrder);
    } else if (this.turnLimitMs > 0) {
      // Chỉ reset streak trong Kid Mode guided — AI quay lại đúng nhiệm vụ
      this.offTopicStreak = 0;
    }

    return cleaned;
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
  const wav = pcmToWav(pcm, 16000, 16);
  const path = `${userId}/live/${conversationId}/${order}.wav`;

  // Upload qua XHR (cách duy nhất đáng tin cậy trên React Native cho ArrayBuffer)
  const arrayBuffer = wav.buffer as ArrayBuffer;

  const { error } = await supabase.storage
    .from('recordings')
    .upload(path, arrayBuffer, { contentType: 'audio/wav', upsert: true });

  if (error) throw new Error(error.message);
  return path;
}
