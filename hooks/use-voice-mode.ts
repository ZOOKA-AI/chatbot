"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "zooka-voice-mode";
const EVENT = "zooka-voice-mode-change";

function read(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Voice mode = one preference shared by the microphone button (auto-send the
 * transcript) and the chat view (speak the assistant reply out loud).
 */
export function useVoiceMode() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(read());
    const sync = () => setEnabled(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = useCallback(() => {
    const next = !read();
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // storage may be unavailable (private mode) - still apply for this page
    }
    setEnabled(next);
    window.dispatchEvent(new Event(EVENT));
    if (!next) {
      stopSpeaking();
    }
  }, []);

  return { voiceMode: enabled, toggleVoiceMode: toggle };
}

export function stripForSpeech(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_#>~|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chrome on Android drops long utterances; keep every chunk short. */
function chunkForSpeech(text: string, max = 180) {
  const sentences = text.match(/[^.!?؟\n]+[.!?؟]?/g) ?? [text];
  const chunks: string[] = [];
  let buffer = "";
  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (!piece) {
      continue;
    }
    if ((buffer + " " + piece).trim().length > max && buffer) {
      chunks.push(buffer.trim());
      buffer = piece;
    } else {
      buffer = `${buffer} ${piece}`.trim();
    }
  }
  if (buffer) {
    chunks.push(buffer.trim());
  }
  return chunks.slice(0, 60);
}

function pickVoice(lang: "ar" | "en") {
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  if (!voices.length) {
    return undefined;
  }
  const wanted = lang === "ar" ? "ar" : "en";
  const exact = voices.find((voice) => voice.lang?.toLowerCase().startsWith(wanted));
  const fallback = voices.find((voice) =>
    voice.lang?.toLowerCase().startsWith("ar")
  );
  return exact ?? fallback;
}

/**
 * Speak text out loud. Must be triggered by a user gesture the first time
 * (browsers block audio that starts on its own), so the caller also uses it as
 * an "unlock" when voice mode is turned on.
 */
export function speakText(text: string, lang: "ar" | "en") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return false;
  }
  const clean = stripForSpeech(text);
  if (!clean) {
    return false;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const chunks = chunkForSpeech(clean.slice(0, 8000));

  const speakChunks = () => {
    const voice = pickVoice(lang);
    chunks.forEach((chunk) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = lang === "ar" ? "ar-SA" : "en-US";
      utterance.rate = 1;
      if (voice) {
        utterance.voice = voice;
      }
      synth.speak(utterance);
    });
  };

  if (synth.getVoices().length === 0) {
    // Voices load asynchronously on some browsers; wait once for them.
    let done = false;
    const onVoices = () => {
      if (done) {
        return;
      }
      done = true;
      synth.removeEventListener?.("voiceschanged", onVoices);
      speakChunks();
    };
    synth.addEventListener?.("voiceschanged", onVoices);
    window.setTimeout(onVoices, 400);
    return true;
  }

  speakChunks();
  return true;
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
