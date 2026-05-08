import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function getSpeechRecognition() {
  const w = window;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export default function useSpeech(language = "en") {
  const SpeechRecognition = useMemo(getSpeechRecognition, []);
  const isSupported = !!SpeechRecognition;

  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState(null);

  const locale = language === "kn" ? "kn-IN" : "en-IN";

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop?.();
    } catch {
      // ignore
    } finally {
      setIsListening(false);
    }
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognition) return;
    setError(null);
    setTranscript("");

    const rec = new SpeechRecognition();
    recognitionRef.current = rec;
    rec.lang = locale;
    rec.interimResults = true;
    rec.continuous = false;

    rec.onstart = () => setIsListening(true);
    rec.onerror = (e) => {
      setError(e?.error || "speech_error");
      setIsListening(false);
    };
    rec.onend = () => {
      setIsListening(false);
    };
    rec.onresult = (event) => {
      const chunks = [];
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        chunks.push(event.results[i][0].transcript);
      }
      const text = chunks.join(" ").trim();
      setTranscript(text);
      const last = event.results[event.results.length - 1];
      if (last?.isFinal) {
        setIsListening(false);
      }
    };

    try {
      rec.start();
    } catch (e) {
      setError(e?.message || "speech_start_failed");
      setIsListening(false);
    }
  }, [SpeechRecognition, locale]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort?.();
      } catch {
        // ignore
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
  };
}

