import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/ThemeProvider';
import { LanguageId } from '../../lib/types';
import {
  CONVERSATION_METHODS,
  ConversationMethodId,
  SPEAKING_STYLES,
  SpeakingStyleId,
  VOICES,
  VoiceId,
} from './options';

interface SetupViewProps {
  toggleSidebar: () => void;
  languageId: LanguageId;
  setLanguageId: (lang: LanguageId) => void;
  accent: 'en-US' | 'en-UK';
  setAccent: (accent: 'en-US' | 'en-UK') => void;
  voice: VoiceId;
  setVoice: (voice: VoiceId) => void;
  speakingStyle: SpeakingStyleId;
  setSpeakingStyle: (style: SpeakingStyleId) => void;
  conversationMethod: ConversationMethodId;
  setConversationMethod: (method: ConversationMethodId) => void;
  topic: string;
  setTopic: (topic: string) => void;
  onStart: () => void;
}

export function SetupView({
  toggleSidebar,
  languageId,
  setLanguageId,
  accent,
  setAccent,
  voice,
  setVoice,
  speakingStyle,
  setSpeakingStyle,
  conversationMethod,
  setConversationMethod,
  topic,
  setTopic,
  onStart,
}: SetupViewProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      {/* Topbar with Drawer trigger and History link */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={toggleSidebar}
          activeOpacity={0.7}
          style={{ padding: 4 }}
          hitSlop={8}
        >
          <Ionicons name="menu" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.historyBtn}
          onPress={() => router.push('/(app)/live/history')}
          activeOpacity={0.7}
        >
          <Ionicons name="time-outline" size={18} color={colors.primary} />
          <Text style={styles.historyBtnText}>Lịch sử</Text>
        </TouchableOpacity>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.setupContainer}>
          <View style={styles.iconWrap}>
            <Ionicons name="radio" size={48} color={colors.primary} />
          </View>
          <Text style={styles.setupTitle}>Hội thoại trực tiếp</Text>
          <Text style={styles.setupSub}>
            Nói chuyện tự nhiên với AI partner theo thời gian thực.{'\n'}
            Nhận xét ngữ pháp & phát âm sẽ hiện sau khi kết thúc phiên.
          </Text>

          {/* Language selector */}
          <View style={styles.langRow}>
            {(['en', 'ja'] as LanguageId[]).map((lang) => (
              <TouchableOpacity
                key={lang}
                style={[styles.langBtn, languageId === lang && styles.langBtnActive]}
                onPress={() => setLanguageId(lang)}
                activeOpacity={0.8}
              >
                <Text style={[styles.langBtnText, languageId === lang && styles.langBtnTextActive]}>
                  {lang === 'en' ? '🇺🇸 English' : '🇯🇵 Japanese'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Accent selector (English only) */}
          {languageId === 'en' && (
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionLabel}>Chất giọng (Accent)</Text>
              <View style={styles.accentRow}>
                <TouchableOpacity
                  style={[styles.accentBtn, accent === 'en-US' && styles.accentBtnActive]}
                  onPress={() => setAccent('en-US')}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[styles.accentBtnText, accent === 'en-US' && styles.accentBtnTextActive]}
                  >
                    🇺🇸 Anh-Mỹ (en-US)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.accentBtn, accent === 'en-UK' && styles.accentBtnActive]}
                  onPress={() => setAccent('en-UK')}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[styles.accentBtnText, accent === 'en-UK' && styles.accentBtnTextActive]}
                  >
                    🇬🇧 Anh-Anh (en-UK)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Voice selector */}
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionLabel}>Giọng nói</Text>
            <View style={styles.voiceGrid}>
              {VOICES.map((v) => (
                <TouchableOpacity
                  key={v.id}
                  style={[styles.voiceChip, voice === v.id && styles.voiceChipActive]}
                  onPress={() => setVoice(v.id)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[styles.voiceChipName, voice === v.id && styles.voiceChipNameActive]}
                  >
                    {v.id}
                  </Text>
                  <Text
                    style={[styles.voiceChipDesc, voice === v.id && styles.voiceChipDescActive]}
                  >
                    {v.desc}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Speaking style */}
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionLabel}>Cách nói chuyện</Text>
            <View style={styles.optionGrid}>
              {SPEAKING_STYLES.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.optionChip, speakingStyle === s.id && styles.optionChipActive]}
                  onPress={() => setSpeakingStyle(s.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.optionChipIcon}>{s.icon}</Text>
                  <Text
                    style={[
                      styles.optionChipLabel,
                      speakingStyle === s.id && styles.optionChipLabelActive,
                    ]}
                  >
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Conversation method */}
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionLabel}>Phương pháp hội thoại</Text>
            <View style={styles.optionGrid}>
              {CONVERSATION_METHODS.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[
                    styles.optionChip,
                    conversationMethod === m.id && styles.optionChipActive,
                  ]}
                  onPress={() => setConversationMethod(m.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.optionChipIcon}>{m.icon}</Text>
                  <Text
                    style={[
                      styles.optionChipLabel,
                      conversationMethod === m.id && styles.optionChipLabelActive,
                    ]}
                  >
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Optional topic */}
          <View style={styles.topicWrap}>
            <Text style={styles.topicLabel}>Chủ đề (tuỳ chọn)</Text>
            <TextInput
              style={styles.topicInput}
              value={topic}
              onChangeText={setTopic}
              placeholder={
                languageId === 'en'
                  ? 'e.g. Travel, Food, Daily life…'
                  : '例: 旅行、食べ物、日常生活…'
              }
              placeholderTextColor={colors.textMuted}
              maxLength={80}
            />
          </View>

          <TouchableOpacity style={styles.startBtn} onPress={onStart} activeOpacity={0.85}>
            <Ionicons name="radio" size={20} color="#fff" />
            <Text style={styles.startBtnText}>Bắt đầu hội thoại</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },

    setupContainer: { alignItems: 'center', padding: 28, gap: 16, paddingBottom: 40 },
    iconWrap: {
      width: 96,
      height: 96,
      borderRadius: 28,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    setupTitle: { fontSize: 26, fontWeight: '800', color: colors.textPrimary },
    setupSub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
    langRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
    langBtn: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    langBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
    langBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
    langBtnTextActive: { color: colors.primary },
    accentRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
    accentBtn: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
    },
    accentBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
    accentBtnText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    accentBtnTextActive: { color: colors.primary },
    topicWrap: { alignSelf: 'stretch', gap: 6 },
    topicLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    topicInput: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 14,
      color: colors.textPrimary,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    startBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingHorizontal: 28,
      paddingVertical: 16,
      width: '100%',
      justifyContent: 'center',
    },
    startBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

    sectionWrap: { alignSelf: 'stretch', gap: 8 },
    sectionLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },

    voiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    voiceChip: {
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      width: '23%',
    },
    voiceChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
    voiceChipName: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
      textAlign: 'center',
    },
    voiceChipNameActive: { color: colors.primary },
    voiceChipDesc: { fontSize: 10, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
    voiceChipDescActive: { color: colors.primary },

    optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    optionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    optionChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
    optionChipIcon: { fontSize: 14 },
    optionChipLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    optionChipLabelActive: { color: colors.primary },

    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    historyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: colors.primaryLight,
    },
    historyBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  });
