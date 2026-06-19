import { Alert } from 'react-native';
import type { AudioPlayer } from 'expo-audio';

/**
 * Tracks whatever single audio/speech source is currently "active" anywhere in
 * the app. Starting a new playback always stops whatever else was playing first —
 * across screens, across players within the same screen, and across mechanisms
 * (expo-audio AudioPlayer vs. expo-speech TTS).
 */
let active: { key: unknown; stop: () => void; onStop: () => void } | null = null;

// expo-audio's Android player never emits an error event when a source fails to
// load (deleted local file, expired/invalid URL, unsupported format) — it just
// stays stuck not-playing forever, which otherwise leaves the UI button "stuck"
// in the playing state with no sound and no recovery (a fresh app launch doesn't
// help either, since the underlying source is broken every time, not the state).
// Poll the player a couple of times after play() and force-stop if it never
// actually started, so the UI always recovers and the user gets feedback.
const WATCHDOG_CHECK_MS = 8000;
const WATCHDOG_MAX_CHECKS = 2;

export function stopActiveAudio() {
  if (!active) return;
  const { stop, onStop } = active;
  active = null;
  try {
    stop();
  } catch {
    // ignore
  }
  onStop();
}

/**
 * Registers `player` as the active audio. Call `stopActiveAudio()` yourself BEFORE
 * creating/loading the new player (not after) — tearing down the old native player
 * while the new one is still being created/loaded can interfere with it on some
 * devices (observed when switching screens mid-playback).
 */
export function registerActiveAudio(player: AudioPlayer, onStop: () => void) {
  const entry = {
    key: player,
    // remove() only frees the native resource — it doesn't reliably halt playback
    // by itself, so pause() first or the previous sound keeps audibly playing.
    stop: () => {
      try {
        player.pause();
      } catch {
        // ignore
      }
      try {
        player.remove();
      } catch {
        // already removed/unloaded — ignore
      }
    },
    onStop,
  };
  active = entry;
  scheduleWatchdog(player, entry, WATCHDOG_MAX_CHECKS);
}

function scheduleWatchdog(
  player: AudioPlayer,
  entry: { key: unknown; stop: () => void; onStop: () => void },
  checksLeft: number,
) {
  setTimeout(() => {
    // Already stopped/replaced/finished normally in the meantime — nothing to do.
    if (active !== entry) return;
    if (player.playing) return;
    if (player.isBuffering && checksLeft > 0) {
      scheduleWatchdog(player, entry, checksLeft - 1);
      return;
    }
    stopActiveAudio();
    Alert.alert('Lỗi', 'Không thể phát âm thanh. File có thể bị lỗi hoặc đã bị xoá.');
  }, WATCHDOG_CHECK_MS);
}

export function clearActiveAudio(player: AudioPlayer) {
  if (active?.key === player) {
    active = null;
  }
}

const SPEECH_KEY = Symbol('speech');

/** Registers an expo-speech utterance (TTS) as the active audio. See registerActiveAudio(). */
export function registerActiveSpeech(stop: () => void, onStop: () => void) {
  active = { key: SPEECH_KEY, stop, onStop };
}

export function clearActiveSpeech() {
  if (active?.key === SPEECH_KEY) {
    active = null;
  }
}
