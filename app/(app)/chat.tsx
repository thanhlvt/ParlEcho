import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { supabase } from '../../lib/supabase';
import { ChatApiResponse, Correction, LanguageId, Message } from '../../lib/types';
import { useAuth } from '../../providers/AuthProvider';

type ViewState = 'start' | 'chat' | 'history';

type UIMessage = Pick<
  Message,
  'id' | 'role' | 'text' | 'translation' | 'furigana' | 'romaji' | 'corrections' | 'hints'
> & { pending?: boolean };

export default function ChatScreen() {
  const { user } = useAuth();
  const flatListRef = useRef<FlatList>(null);

  const [view, setView] = useState<ViewState>('start');
  const [languageId, setLanguageId] = useState<LanguageId>('en');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loadingInit, setLoadingInit] = useState(true);
  const [historyConvs, setHistoryConvs] = useState<
    Array<{ id: string; language_id: LanguageId; started_at: string }>
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Load active language from profile when screen focuses
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      supabase
        .from('profiles')
        .select('active_language_id')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.active_language_id) setLanguageId(data.active_language_id as LanguageId);
          setLoadingInit(false);
        });
    }, [user?.id]),
  );

  // ── Start conversation ──────────────────────────────────────────────
  async function startConversation() {
    if (!user) return;
    setSending(true);
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        user_id: user.id,
        language_id: languageId,
        mode: 'roleplay',
      })
      .select('id')
      .single();

    if (error || !data) {
      Alert.alert('Lỗi', 'Không thể tạo cuộc trò chuyện mới.');
      setSending(false);
      return;
    }

    setConversationId(data.id);
    setMessages([]);
    setView('chat');
    setSending(false);
  }

  // ── New chat ────────────────────────────────────────────────────────
  function newChat() {
    setConversationId(null);
    setMessages([]);
    setInput('');
    setExpandedIds(new Set());
    setView('start');
  }

  // ── Load history ────────────────────────────────────────────────────
  async function loadHistory() {
    if (!user) return;
    setView('history');
    setHistoryLoading(true);
    const { data } = await supabase
      .from('conversations')
      .select('id, language_id, started_at')
      .eq('user_id', user.id)
      .eq('mode', 'roleplay')
      .order('started_at', { ascending: false })
      .limit(30);
    setHistoryConvs((data ?? []) as typeof historyConvs);
    setHistoryLoading(false);
  }

  // ── Resume conversation ─────────────────────────────────────────────
  async function resumeConversation(convId: string, lang: LanguageId) {
    setSending(true);
    const { data } = await supabase
      .from('messages')
      .select('id, role, text, translation, furigana, romaji, corrections, hints')
      .eq('conversation_id', convId)
      .order('sort_order');

    setConversationId(convId);
    setLanguageId(lang);
    setMessages(
      (data ?? []).map((m) => ({
        id: m.id as string,
        role: m.role as 'user' | 'assistant',
        text: m.text as string,
        translation: m.translation as string | null,
        furigana: m.furigana as string | null,
        romaji: m.romaji as string | null,
        corrections: m.corrections as typeof messages[0]['corrections'],
        hints: m.hints as string[] | null,
      })),
    );
    setExpandedIds(new Set());
    setView('chat');
    setSending(false);
    scrollToEnd(300);
  }

  // ── Send message ────────────────────────────────────────────────────
  async function sendMessage() {
    const text = input.trim();
    if (!text || !conversationId || sending) return;
    setInput('');
    setSending(true);

    const optimisticId = `opt-${Date.now()}`;
    const userMsg: UIMessage = {
      id: optimisticId,
      role: 'user',
      text,
      translation: null,
      furigana: null,
      romaji: null,
      corrections: null,
      hints: null,
      pending: false,
    };
    setMessages((prev) => [...prev, userMsg]);
    scrollToEnd();

    // Build history for context (last 10 exchanges)
    const history = messages.slice(-10).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.text,
    }));

    try {
      const { data, error } = await supabase.functions.invoke<ChatApiResponse>('chat', {
        body: {
          conversation_id: conversationId,
          message: text,
          language_id: languageId,
          mode: 'roleplay',
          history,
        },
      });

      if (error) throw new Error(error.message);
      const resp = data!;

      const aiMsg: UIMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        text: resp.reply,
        translation: resp.translation ?? null,
        furigana: resp.furigana ?? null,
        romaji: resp.romaji ?? null,
        corrections: resp.corrections?.length ? resp.corrections : null,
        hints: resp.hints?.length ? resp.hints : null,
      };

      setMessages((prev) => [...prev, aiMsg]);
      scrollToEnd(300);
    } catch (err) {
      Alert.alert('Lỗi', err instanceof Error ? err.message : 'Không thể gửi tin nhắn');
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    } finally {
      setSending(false);
    }
  }

  function scrollToEnd(delay = 100) {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), delay);
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Render start screen ─────────────────────────────────────────────
  if (loadingInit) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ flex: 1 }} color={Colors.primary} />
      </SafeAreaView>
    );
  }

  if (view === 'start') {
    return (
      <SafeAreaView style={styles.safe}>
        <TouchableOpacity style={styles.historyBtn} onPress={loadHistory} activeOpacity={0.7}>
          <Ionicons name="time-outline" size={18} color={Colors.primary} />
          <Text style={styles.historyBtnText}>Lịch sử</Text>
        </TouchableOpacity>
        <View style={styles.startContainer}>
          <View style={styles.iconWrap}>
            <Ionicons name="chatbubbles" size={48} color={Colors.primary} />
          </View>
          <Text style={styles.startTitle}>Hội thoại AI</Text>
          <Text style={styles.startSubtitle}>
            Luyện {languageId === 'en' ? 'tiếng Anh' : 'tiếng Nhật'} với AI partner. Nhận sửa lỗi
            ngữ pháp và gợi ý câu real-time.
          </Text>

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

          <TouchableOpacity
            style={[styles.startBtn, sending && { opacity: 0.6 }]}
            onPress={startConversation}
            disabled={sending}
            activeOpacity={0.85}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="chatbubble-ellipses" size={20} color="#fff" />
                <Text style={styles.startBtnText}>Bắt đầu hội thoại</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render history screen ───────────────────────────────────────────
  if (view === 'history') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.historyHeader}>
          <TouchableOpacity onPress={() => setView('start')} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.historyTitle}>Lịch sử hội thoại</Text>
          <View style={{ width: 22 }} />
        </View>

        {historyLoading ? (
          <ActivityIndicator style={{ flex: 1 }} color={Colors.primary} />
        ) : historyConvs.length === 0 ? (
          <View style={styles.historyEmpty}>
            <Ionicons name="chatbubbles-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.historyEmptyText}>Chưa có phiên nào</Text>
          </View>
        ) : (
          <FlatList
            data={historyConvs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.historyList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.historyCard}
                activeOpacity={0.75}
                onPress={() => resumeConversation(item.id, item.language_id)}
                disabled={sending}
              >
                <View style={styles.historyCardLeft}>
                  <Text style={styles.historyLang}>
                    {item.language_id === 'en' ? '🇺🇸' : '🇯🇵'}
                  </Text>
                  <View>
                    <Text style={styles.historyDate}>
                      {new Date(item.started_at).toLocaleDateString('vi-VN', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                      })}
                    </Text>
                    <Text style={styles.historyTime}>
                      {new Date(item.started_at).toLocaleTimeString('vi-VN', {
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </View>
                <View style={styles.historyResume}>
                  <Text style={styles.historyResumeText}>Tiếp tục</Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </SafeAreaView>
    );
  }

  // ── Render chat screen ──────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Header */}
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={newChat} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.chatHeaderCenter}>
          <Text style={styles.chatHeaderTitle}>AI Partner</Text>
          <Text style={styles.chatHeaderSub}>
            {languageId === 'en' ? '🇺🇸 English' : '🇯🇵 Japanese'}
          </Text>
        </View>
        <TouchableOpacity onPress={newChat} hitSlop={8}>
          <Ionicons name="add-circle-outline" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.messageList}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatText}>
                Hãy viết gì đó để bắt đầu hội thoại!{'\n'}
                {languageId === 'en' ? 'Try: "Hi! How are you?"' : 'Try: "こんにちは！"'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ChatBubble
              message={item}
              languageId={languageId}
              expanded={expandedIds.has(item.id)}
              onToggleExpand={() => toggleExpanded(item.id)}
            />
          )}
        />

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder={languageId === 'en' ? 'Type in English…' : '日本語で書いてください…'}
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!input.trim() || sending) && styles.sendBtnDisabled,
            ]}
            onPress={sendMessage}
            disabled={!input.trim() || sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Chat Bubble ───────────────────────────────────────────────────────
function ChatBubble({
  message,
  languageId,
  expanded,
  onToggleExpand,
}: {
  message: UIMessage;
  languageId: LanguageId;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const isUser = message.role === 'user';
  const [showTranslation, setShowTranslation] = useState(false);

  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      {!isUser && (
        <View style={styles.avatarDot}>
          <Text style={{ fontSize: 14 }}>🤖</Text>
        </View>
      )}

      <View style={[styles.bubbleWrap, isUser && styles.bubbleWrapUser]}>
        {/* Main bubble */}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
          <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
            {message.text}
          </Text>

          {/* Japanese reading aids */}
          {!isUser && languageId === 'ja' && message.furigana ? (
            <Text style={styles.furigana}>{message.furigana}</Text>
          ) : null}
          {!isUser && languageId === 'ja' && message.romaji ? (
            <Text style={styles.romaji}>{message.romaji}</Text>
          ) : null}

          {/* Translation toggle */}
          {!isUser && message.translation ? (
            <>
              <Pressable onPress={() => setShowTranslation((v) => !v)} style={styles.transBtn}>
                <Text style={styles.transBtnText}>
                  {showTranslation ? 'Ẩn dịch ▲' : 'Xem dịch ▼'}
                </Text>
              </Pressable>
              {showTranslation && (
                <Text style={styles.translationText}>{message.translation}</Text>
              )}
            </>
          ) : null}
        </View>

        {/* Corrections chip */}
        {!isUser && message.corrections?.length ? (
          <Pressable style={styles.corrChip} onPress={onToggleExpand}>
            <Ionicons
              name={expanded ? 'checkmark-circle' : 'alert-circle-outline'}
              size={14}
              color={expanded ? Colors.success : Colors.warning}
            />
            <Text style={styles.corrChipText}>
              {message.corrections.length} lỗi cần sửa {expanded ? '▲' : '▼'}
            </Text>
          </Pressable>
        ) : null}

        {/* Corrections detail */}
        {!isUser && expanded && message.corrections?.length ? (
          <View style={styles.corrPanel}>
            {message.corrections.map((c, i) => (
              <CorrectionRow key={i} correction={c} />
            ))}
          </View>
        ) : null}

      </View>
    </View>
  );
}

function CorrectionRow({ correction }: { correction: Correction }) {
  return (
    <View style={styles.corrRow}>
      <View style={styles.corrBefore}>
        <Text style={styles.corrLabel}>Sai</Text>
        <Text style={styles.corrOriginal}>{correction.original}</Text>
      </View>
      <Ionicons name="arrow-forward" size={14} color={Colors.textMuted} style={{ marginTop: 2 }} />
      <View style={styles.corrAfter}>
        <Text style={styles.corrLabel}>Đúng</Text>
        <Text style={styles.corrFixed}>{correction.fixed}</Text>
      </View>
      {correction.explanation ? (
        <Text style={styles.corrExplain}>{correction.explanation}</Text>
      ) : null}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  // ── Start screen
  startContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  iconWrap: {
    width: 96,
    height: 96,
    backgroundColor: Colors.primaryLight,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  startTitle: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  startSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
  langRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  langBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  langBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  langBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  langBtnTextActive: { color: Colors.primary },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingHorizontal: 28,
    paddingVertical: 16,
    marginTop: 8,
    width: '100%',
    justifyContent: 'center',
  },
  startBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // ── Chat header
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chatHeaderCenter: { flex: 1, alignItems: 'center' },
  chatHeaderTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  chatHeaderSub: { fontSize: 12, color: Colors.textMuted },

  // ── Message list
  messageList: { padding: 16, gap: 12 },
  emptyChat: { alignItems: 'center', paddingTop: 48 },
  emptyChatText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },

  // ── Bubble row
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    maxWidth: '90%',
    alignSelf: 'flex-start',
  },
  bubbleRowUser: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  avatarDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bubbleWrap: { gap: 4, flex: 1 },
  bubbleWrapUser: { alignItems: 'flex-end' },

  // ── Bubble
  bubble: {
    borderRadius: 18,
    padding: 14,
    maxWidth: '100%',
  },
  bubbleUser: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  bubbleText: { fontSize: 15, color: Colors.textPrimary, lineHeight: 22 },
  bubbleTextUser: { color: '#fff' },
  furigana: { fontSize: 12, color: Colors.textMuted, marginTop: 6 },
  romaji: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', marginTop: 2 },
  transBtn: { marginTop: 8 },
  transBtnText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  translationText: { fontSize: 13, color: Colors.textSecondary, marginTop: 4, fontStyle: 'italic' },

  // ── Corrections
  corrChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  corrChipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  corrPanel: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  corrRow: { gap: 4 },
  corrBefore: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  corrAfter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  corrLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, width: 28 },
  corrOriginal: { fontSize: 13, color: Colors.error, textDecorationLine: 'line-through' },
  corrFixed: { fontSize: 13, color: Colors.success, fontWeight: '600' },
  corrExplain: { fontSize: 12, color: Colors.textMuted, marginTop: 2, fontStyle: 'italic' },

  // ── Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'ios' ? 12 : 10,
    paddingBottom: 10,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.border },

  // ── History
  historyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-end', margin: 16, marginBottom: 0,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, backgroundColor: Colors.primaryLight,
  },
  historyBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  historyHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  historyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  historyList: { padding: 16, gap: 10 },
  historyEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  historyEmptyText: { fontSize: 14, color: Colors.textMuted },
  historyCard: {
    backgroundColor: Colors.surface, borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
  },
  historyCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyLang: { fontSize: 24 },
  historyDate: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  historyTime: { fontSize: 12, color: Colors.textMuted },
  historyResume: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  historyResumeText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
});
