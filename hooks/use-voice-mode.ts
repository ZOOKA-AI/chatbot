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
  }, []);

  return { voiceMode: enabled, toggleVoiceMode: toggle };
}

function stripForSpeech(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_#>~|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
  const utterance = new SpeechSynthesisUtterance(clean.slice(0, 4000));
  utterance.lang = lang === "ar" ? "ar-SA" : "en-US";
  utterance.rate = 1;
  const voices = synth.getVoices();
  const preferred =
    voices.find((voice) => voice.lang?.toLowerCase().startsWith(lang)) ??
    voices.find((voice) => voice.lang?.toLowerCase().startsWith("ar"));
  if (preferred) {
    utterance.voice = preferred;
  }
  synth.speak(utterance);
  return true;
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
