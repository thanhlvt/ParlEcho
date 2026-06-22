/**
 * Live Conversation Screen
 *
 * View states: setup → connecting → live → saving → (navigate to review)
 *
 * The view-specific UI lives in SetupView / LiveConversationView / StatusView;
 * all session state, audio wiring, and Supabase persistence is in useLiveSession.
 */

import { useSidebar } from '../_layout';
import { LiveConversationView } from '../../../components/live/LiveConversationView';
import { SetupView } from '../../../components/live/SetupView';
import { StatusView } from '../../../components/live/StatusView';
import { useLiveSession } from '../../../components/live/useLiveSession';

export default function LiveScreen() {
  const { toggleSidebar } = useSidebar();
  const session = useLiveSession();

  if (session.view === 'setup') {
    return (
      <SetupView
        toggleSidebar={toggleSidebar}
        languageId={session.languageId}
        setLanguageId={session.setLanguageId}
        accent={session.accent}
        setAccent={session.setAccent}
        voice={session.voice}
        setVoice={session.setVoice}
        speakingStyle={session.speakingStyle}
        setSpeakingStyle={session.setSpeakingStyle}
        conversationMethod={session.conversationMethod}
        setConversationMethod={session.setConversationMethod}
        topic={session.topic}
        setTopic={session.setTopic}
        onStart={session.startSession}
      />
    );
  }

  if (session.view === 'connecting') {
    return <StatusView message="Đang kết nối..." />;
  }

  if (session.view === 'saving') {
    return <StatusView message={session.savingMsg} />;
  }

  return (
    <LiveConversationView
      flatRef={session.flatRef}
      turns={session.turns}
      flaggedWordsByOrder={session.flaggedWordsByOrder}
      liveState={session.liveState}
      isPaused={session.isPaused}
      elapsedSec={session.elapsedSec}
      languageId={session.languageId}
      onTogglePause={session.togglePause}
      onEndSession={session.endSession}
    />
  );
}
