import type { AudioPlayer } from 'expo-audio';

/**
 * Tracks the single AudioPlayer currently playing anywhere in the app.
 * Starting a new playback (via setActiveAudio) always stops whatever else
 * was playing first — across screens and across players within the same
 * screen (e.g. TTS line vs. user recording vs. another chat bubble).
 */
let active: { player: AudioPlayer; onStop: () => void } | null = null;

export function stopActiveAudio() {
  if (!active) return;
  const { player, onStop } = active;
  active = null;
  // remove() only frees the native resource — it doesn't reliably halt playback
  // by itself, so pause() first or the previous sound keeps audibly playing.
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
  onStop();
}

/**
 * Registers `player` as the active audio. Call `stopActiveAudio()` yourself BEFORE
 * creating/loading the new player (not after) — tearing down the old native player
 * while the new one is still being created/loaded can interfere with it on some
 * devices (observed when switching screens mid-playback).
 */
export function registerActiveAudio(player: AudioPlayer, onStop: () => void) {
  active = { player, onStop };
}

export function clearActiveAudio(player: AudioPlayer) {
  if (active?.player === player) {
    active = null;
  }
}
