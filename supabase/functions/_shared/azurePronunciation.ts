import * as sdk from 'npm:microsoft-cognitiveservices-speech-sdk@1.46.0';

export interface PhonemeAssessment {
  phoneme: string; // IPA, vd /ɛ/ (đã set phonemeAlphabet='IPA', mặc định SDK là 'SAPI')
  accuracyScore: number;
  // Phoneme IPA mà Azure cho là khả năng cao đã nghe được thay cho `phoneme` (từ NBestPhonemes,
  // chỉ điền khi có ứng viên khác với confidence cao hơn chính `phoneme`) — null nếu không có.
  bestGuess: string | null;
}

export interface WordAssessment {
  word: string;
  accuracyScore: number;
  errorType: string; // None | Mispronunciation | Omission | Insertion | Monotone | UnexpectedBreak | MissingBreak
  phonemes: PhonemeAssessment[];
}

export interface AzureAssessmentResult {
  accuracy: number;
  fluency: number;
  prosody: number | null; // null khi locale không hỗ trợ prosody (chỉ en-US) hoặc audio quá ngắn
  // Azure LUÔN trả 1 số (mặc định 100 khi unscripted, coi như "đủ" vì không có gì để so khớp) —
  // null ở đây CHỈ xảy ra khi parse JSON thất bại. Lớp gọi (pronounce/index.ts) phải tự ép null
  // khi không có reference_text, KHÔNG dùng thẳng giá trị 100 mặc định đó.
  completeness: number | null;
  transcript: string;
  words: WordAssessment[];
}

interface AssessParams {
  pcm: Uint8Array;
  sampleRate?: number; // mặc định 16000 — khớp pcmToWav phía client
  locale: string; // 'en-US' | 'en-GB' | 'ja-JP'...
  referenceText?: string; // có giá trị => scripted assessment, rỗng/undefined => unscripted
}

const CHUNK_MS = 100;
const SINGLE_SHOT_MAX_SEC = 30; // theo doc Azure: audio dài hơn 30s phải dùng continuous mode
// Số phoneme ứng viên khả dĩ nhất Azure trả về mỗi phoneme (NBestPhonemes) — dùng để báo cụ
// thể "nghe như /x/" khi Mispronunciation, thay vì chỉ nói chung "phát âm chưa chuẩn".
const NBEST_PHONEME_COUNT = 5;

function prosodySupported(locale: string): boolean {
  // Prosody assessment chỉ available ở en-US (theo doc Azure pronunciation assessment)
  return locale === 'en-US';
}

// Azure CHỈ trả kết quả cuối (speech.phrase) khi PCM được ghi vào push stream theo nhịp
// gần với thời gian thực — đẩy cả buffer 1 lần khiến server kẹt mãi ở speech.hypothesis,
// không bao giờ phát speech.endDetected/speech.phrase (đã verify bằng spike, tái hiện 2 lần).
async function writePcmRealtime(
  pushStream: sdk.PushAudioInputStream,
  pcm: Uint8Array,
  sampleRate: number,
): Promise<void> {
  const bytesPerChunk = Math.round(sampleRate * 2 * (CHUNK_MS / 1000));
  for (let i = 0; i < pcm.length; i += bytesPerChunk) {
    const slice = pcm.subarray(i, i + bytesPerChunk);
    pushStream.write(new Uint8Array(slice).buffer);
    await new Promise((r) => setTimeout(r, CHUNK_MS));
  }
  pushStream.close();
}

interface AzureNBestPhoneme {
  Phoneme: string;
  Score: number;
}

interface AzurePhoneme {
  Phoneme: string;
  // NBestPhonemes nằm BÊN TRONG PronunciationAssessment (không ngang hàng với Phoneme) — đã
  // verify bằng JSON thật, dễ nhầm vì các field khác (Word) thì NBest nằm ở object cha.
  PronunciationAssessment?: { AccuracyScore?: number; NBestPhonemes?: AzureNBestPhoneme[] };
}

interface AzureWord {
  Word: string;
  PronunciationAssessment?: { AccuracyScore?: number; ErrorType?: string };
  Phonemes?: AzurePhoneme[];
}

// `NBestPhonemes` (chỉ có khi set nbestPhonemeCount) liệt kê các phoneme khả dĩ nhất Azure nghe
// được kèm điểm tin cậy tương đối (ứng viên đứng đầu luôn ~100, KHÔNG cùng thang điểm với
// AccuracyScore của phoneme kỳ vọng) — nếu ứng viên đứng đầu khác `Phoneme` (kỳ vọng) và điểm tin
// cậy của nó cao hơn AccuracyScore hiện tại, đó nhiều khả năng là âm học viên ĐÃ THỰC SỰ phát ra,
// dùng để báo cụ thể "nghe như /x/" thay vì chỉ nói chung "phát âm chưa chuẩn".
function parsePhonemes(raw: AzurePhoneme[] | undefined): PhonemeAssessment[] {
  return (raw ?? []).map((p) => {
    const accuracyScore = p.PronunciationAssessment?.AccuracyScore ?? 0;
    const top = (p.PronunciationAssessment?.NBestPhonemes ?? []).reduce<AzureNBestPhoneme | null>(
      (best, cand) => (best === null || cand.Score > best.Score ? cand : best),
      null,
    );
    const bestGuess =
      top && top.Phoneme !== p.Phoneme && top.Score > accuracyScore ? top.Phoneme : null;
    return { phoneme: p.Phoneme, accuracyScore, bestGuess };
  });
}

function wordsFromJsonResult(jsonResult: string): WordAssessment[] {
  try {
    const detail = JSON.parse(jsonResult);
    const nbest = detail.NBest?.[0];
    return ((nbest?.Words ?? []) as AzureWord[]).map((w) => ({
      word: w.Word,
      accuracyScore: w.PronunciationAssessment?.AccuracyScore ?? 0,
      errorType: w.PronunciationAssessment?.ErrorType ?? 'None',
      phonemes: parsePhonemes(w.Phonemes),
    }));
  } catch {
    return [];
  }
}

function prosodyFromJsonResult(jsonResult: string): number | null {
  try {
    const detail = JSON.parse(jsonResult);
    const score = detail.NBest?.[0]?.PronunciationAssessment?.ProsodyScore;
    return typeof score === 'number' ? score : null;
  } catch {
    return null;
  }
}

// Chỉ có giá trị khi scripted (có reference_text) — Azure không trả CompletenessScore khi
// unscripted (xem doc: field này chỉ nằm trong bảng "Scripted assessment results").
function completenessFromJsonResult(jsonResult: string): number | null {
  try {
    const detail = JSON.parse(jsonResult);
    const score = detail.NBest?.[0]?.PronunciationAssessment?.CompletenessScore;
    return typeof score === 'number' ? score : null;
  } catch {
    return null;
  }
}

function recognizeOnce(recognizer: sdk.SpeechRecognizer): Promise<AzureAssessmentResult> {
  return new Promise((resolve, reject) => {
    recognizer.recognizeOnceAsync(
      (result) => {
        if (result.reason !== sdk.ResultReason.RecognizedSpeech) {
          resolve({
            accuracy: 0,
            fluency: 0,
            prosody: null,
            completeness: null,
            transcript: '',
            words: [],
          });
          return;
        }
        const pronResult = sdk.PronunciationAssessmentResult.fromResult(result);
        const jsonResult =
          result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult) ?? '{}';
        resolve({
          accuracy: pronResult.accuracyScore ?? 0,
          fluency: pronResult.fluencyScore ?? 0,
          prosody:
            (pronResult as unknown as { prosodyScore?: number }).prosodyScore ??
            prosodyFromJsonResult(jsonResult),
          completeness: pronResult.completenessScore ?? completenessFromJsonResult(jsonResult),
          transcript: result.text,
          words: wordsFromJsonResult(jsonResult),
        });
      },
      (err: unknown) => reject(new Error(String(err))),
    );
  });
}

// Continuous mode (audio > 30s): Azure không hỗ trợ EnableMiscue ở mode này nên word-level
// errorType sẽ thiếu Omission/Insertion (chỉ có Mispronunciation/None/Monotone...). Công thức
// tổng hợp theo đúng sample chính thức của Azure (pronunciationAssessmentContinue.js): accuracy =
// trung bình AccuracyScore các từ hợp lệ, fluency = tổng thời lượng từ hợp lệ / tổng thời lượng
// audio, prosody/completeness = trung bình từng giá trị theo câu (CompletenessScore chỉ có khi
// scripted, giống single-shot).
function recognizeContinuous(recognizer: sdk.SpeechRecognizer): Promise<AzureAssessmentResult> {
  return new Promise((resolve, reject) => {
    const allWords: WordAssessment[] = [];
    const transcripts: string[] = [];
    const prosodyScores: number[] = [];
    const completenessScores: number[] = [];
    let accuracySum = 0;
    let validWordCount = 0;
    let validWordDuration = 0;
    let totalAudioDuration = 0;

    recognizer.recognized = (_s, e) => {
      if (e.result.reason !== sdk.ResultReason.RecognizedSpeech) return;
      const jsonResult =
        e.result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult) ?? '{}';
      let detail: { NBest?: Array<{ Words?: unknown[] }>; Duration?: number };
      try {
        detail = JSON.parse(jsonResult);
      } catch {
        return;
      }
      const nbest = detail.NBest?.[0] as
        | {
            Words?: Array<AzureWord & { Duration?: number }>;
            PronunciationAssessment?: { ProsodyScore?: number; CompletenessScore?: number };
          }
        | undefined;
      if (!nbest) return;

      transcripts.push(e.result.text);
      if (typeof nbest.PronunciationAssessment?.ProsodyScore === 'number') {
        prosodyScores.push(nbest.PronunciationAssessment.ProsodyScore);
      }
      if (typeof nbest.PronunciationAssessment?.CompletenessScore === 'number') {
        completenessScores.push(nbest.PronunciationAssessment.CompletenessScore);
      }
      for (const w of nbest.Words ?? []) {
        const accuracyScore = w.PronunciationAssessment?.AccuracyScore ?? 0;
        const errorType = w.PronunciationAssessment?.ErrorType ?? 'None';
        allWords.push({
          word: w.Word,
          accuracyScore,
          errorType,
          phonemes: parsePhonemes(w.Phonemes),
        });
        if (errorType !== 'Insertion') {
          accuracySum += accuracyScore;
          validWordCount += 1;
          validWordDuration += w.Duration ?? 0;
        }
      }
      totalAudioDuration += detail.Duration ?? 0;
    };

    recognizer.canceled = (_s, e) => {
      if (e.reason === sdk.CancellationReason.Error) {
        reject(new Error(`Azure continuous recognition canceled: ${e.errorDetails}`));
      }
    };

    recognizer.sessionStopped = () => {
      recognizer.stopContinuousRecognitionAsync(() => {
        const prosody =
          prosodyScores.length > 0
            ? Math.round((prosodyScores.reduce((a, b) => a + b, 0) / prosodyScores.length) * 10) /
              10
            : null;
        const completeness =
          completenessScores.length > 0
            ? Math.round(completenessScores.reduce((a, b) => a + b, 0) / completenessScores.length)
            : null;
        resolve({
          accuracy: validWordCount > 0 ? Math.round(accuracySum / validWordCount) : 0,
          fluency:
            totalAudioDuration > 0
              ? Math.min(100, Math.round((validWordDuration / totalAudioDuration) * 100))
              : 0,
          prosody,
          completeness,
          transcript: transcripts.join(' '),
          words: allWords,
        });
      });
    };

    recognizer.startContinuousRecognitionAsync(
      () => {},
      (err: unknown) => reject(new Error(String(err))),
    );
  });
}

export async function assessPronunciation({
  pcm,
  sampleRate = 16000,
  locale,
  referenceText,
}: AssessParams): Promise<AzureAssessmentResult> {
  const key = Deno.env.get('AZURE_SPEECH_KEY');
  const region = Deno.env.get('AZURE_SPEECH_REGION');
  if (!key || !region) throw new Error('AZURE_SPEECH_KEY/AZURE_SPEECH_REGION not configured');

  const durationSec = pcm.length / (sampleRate * 2);
  const isContinuous = durationSec > SINGLE_SHOT_MAX_SEC;
  const enableProsody = prosodySupported(locale);

  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = locale;

  const pushStream = sdk.AudioInputStream.createPushStream(
    sdk.AudioStreamFormat.getWaveFormatPCM(sampleRate, 16, 1),
  );
  const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);

  const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
    referenceText ?? '',
    sdk.PronunciationAssessmentGradingSystem.HundredMark,
    sdk.PronunciationAssessmentGranularity.Phoneme,
    !isContinuous, // EnableMiscue không được hỗ trợ ở continuous mode
  );
  if (enableProsody) pronunciationConfig.enableProsodyAssessment = true;
  // Mặc định SDK trả phoneme dạng SAPI và không kèm NBestPhonemes — đổi sang IPA + bật NBest để
  // có thể báo "nghe như /x/" cụ thể khi Mispronunciation (xem pickFlaggedWords).
  pronunciationConfig.phonemeAlphabet = 'IPA';
  pronunciationConfig.nbestPhonemeCount = NBEST_PHONEME_COUNT;

  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
  pronunciationConfig.applyTo(recognizer);

  const writeDone = writePcmRealtime(pushStream, pcm, sampleRate);

  try {
    const result = isContinuous
      ? await recognizeContinuous(recognizer)
      : await recognizeOnce(recognizer);
    await writeDone;
    return result;
  } finally {
    recognizer.close();
  }
}

// ── Gộp điểm Azure thành clarity/fluency (giữ nguyên output shape cũ thời Gemini) ──
// clarity/fluency gốc (Gemini) định nghĩa: clarity = "clarity AND word stress", fluency =
// "flow AND natural intonation". Stress + intonation đều nằm trong ProsodyScore của Azure
// (1 số duy nhất cho cả câu, không tách riêng theo tiêu chí) nên gộp đều vào cả 2 trục là
// cách đơn giản nhất, không bịa thêm tiêu chí mới. ja-JP không có prosody → giữ nguyên
// accuracy/fluency thô của Azure, không gãy.
export function mergeClarityFluency(
  result: Pick<AzureAssessmentResult, 'accuracy' | 'fluency' | 'prosody'>,
): {
  clarity: number;
  fluency: number;
} {
  const { accuracy, fluency, prosody } = result;
  if (prosody == null) return { clarity: accuracy, fluency };
  return {
    clarity: Math.round((accuracy + prosody) / 2),
    fluency: Math.round((fluency + prosody) / 2),
  };
}

// ── Tip tiếng Việt theo mã lỗi Azure (Azure không tự sinh tip như Gemini trước đây) ──
const ERROR_TIP_MAP: Record<string, string> = {
  Mispronunciation: 'Phát âm chưa chuẩn, nghe lại và luyện lại âm này.',
  Omission: 'Bị bỏ sót khi nói, nhớ đọc đầy đủ từ này.',
  Insertion: 'Thừa từ so với câu mẫu, chú ý đọc đúng câu.',
  Monotone: 'Ngữ điệu đều đều, thử lên xuống giọng tự nhiên hơn.',
  UnexpectedBreak: 'Ngắt nghỉ không cần thiết trước từ này.',
  MissingBreak: 'Thiếu ngắt nghỉ trước từ này.',
};

// Mispronunciation: chỉ ra cụ thể (tối đa 2) phoneme bị sai + âm nghe được thay vào (IPA) —
// thay cho tip chung "phát âm chưa chuẩn". Phoneme không có `bestGuess` (không có ứng viên nào
// rõ hơn chính nó) bị bỏ qua; nếu không phoneme nào đủ cụ thể, rơi về tip chung trong ERROR_TIP_MAP.
function buildMispronunciationTip(word: WordAssessment): string | null {
  const specific = word.phonemes
    .filter((p) => p.bestGuess !== null)
    .sort((a, b) => a.accuracyScore - b.accuracyScore)
    .slice(0, 2);
  if (specific.length === 0) return null;
  const detail = specific.map((p) => `/${p.phoneme}/ nghe như /${p.bestGuess}/`).join(', ');
  return `Phát âm chưa chuẩn: ${detail} — luyện lại âm này.`;
}

function buildTip(word: WordAssessment): string {
  if (word.errorType === 'Mispronunciation') {
    const specific = buildMispronunciationTip(word);
    if (specific) return specific;
  }
  return ERROR_TIP_MAP[word.errorType] ?? 'Cần luyện lại từ này.';
}

export function pickFlaggedWords(
  words: WordAssessment[],
  max = 3,
): Array<{ word: string; tip: string }> {
  return words
    .filter((w) => w.errorType !== 'None')
    .sort((a, b) => a.accuracyScore - b.accuracyScore)
    .slice(0, max)
    .map((w) => ({ word: w.word, tip: buildTip(w) }));
}

// Map ngôn ngữ app ('en'/'ja') + accent (nếu có, từ Live) → locale Azure.
export function toAzureLocale(languageId: string, accent?: string): string {
  if (languageId === 'ja') return 'ja-JP';
  // App dùng 'en-UK' theo quy ước riêng (components/live/options.ts#AccentId, dùng cho prompt
  // Gemini Live) — không phải mã BCP-47 chuẩn; Azure cần 'en-GB'.
  if (accent === 'en-UK') return 'en-GB';
  if (accent && accent.startsWith('en-')) return accent;
  return 'en-US';
}
