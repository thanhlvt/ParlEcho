import type { AudioPlayer } from 'expo-audio';

/**
 * Tracks whatever single audio/speech source is currently "active" anywhere in
 * the app. Starting a new playback always stops whatever else was playing first —
 * across screens, across players within the same screen, and across mechanisms
 * (expo-audio AudioPlayer vs. expo-speech TTS).
 */
let active: { key: unknown; stop: () => void; onStop: () => void } | null = null;

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
  active = {
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
