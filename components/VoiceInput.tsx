"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Free, zero-cost speech-to-text using the browser's built-in Web Speech API
 * (Chrome, Edge, Safari incl. iOS). No keys, no service.
 *
 * Truly continuous dictation: Chrome fires `onend` after any pause of silence,
 * so we auto-restart recognition for as long as the user intends to be talking
 * and accumulate the final text across those restarts. The user stays in control
 * — it only stops when they tap stop (or the browser denies the mic).
 */
export function VoiceInput({
  onTranscript,
  label = "Speak your idea",
}: {
  onTranscript: (text: string) => void;
  label?: string;
}) {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);

  const recognitionRef = useRef<any>(null);
  const wantListeningRef = useRef(false); // user's intent — survives auto-restarts
  const finalTextRef = useRef(""); // accumulated final transcript across restarts
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    const SpeechRecognition =
      (typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
      null;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTextRef.current += transcript + " ";
        else interim += transcript;
      }
      onTranscriptRef.current((finalTextRef.current + interim).trim());
    };

    // The key fix: when the engine ends on a silence gap, restart it if the
    // user still wants to be listening.
    recognition.onend = () => {
      if (wantListeningRef.current) {
        try {
          recognition.start();
        } catch {
          // start() can throw if called too quickly; retry shortly.
          setTimeout(() => {
            if (wantListeningRef.current) {
              try {
                recognition.start();
              } catch {}
            }
          }, 250);
        }
      } else {
        setListening(false);
      }
    };

    recognition.onerror = (e: any) => {
      // Permission/hardware errors should genuinely stop; transient ones
      // (no-speech, aborted) are handled by onend's auto-restart.
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed" || e?.error === "audio-capture") {
        wantListeningRef.current = false;
        setListening(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      wantListeningRef.current = false;
      try {
        recognition.stop();
      } catch {}
    };
  }, []);

  function start() {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    wantListeningRef.current = true;
    setListening(true);
    try {
      recognition.start();
    } catch {
      // already started — ignore
    }
  }

  function stop() {
    const recognition = recognitionRef.current;
    wantListeningRef.current = false;
    setListening(false);
    try {
      recognition?.stop();
    } catch {}
  }

  if (!supported) {
    return <p className="text-xs text-muted">Voice input isn’t supported in this browser — type your idea below.</p>;
  }

  return (
    <button
      type="button"
      onClick={() => (listening ? stop() : start())}
      className={listening ? "btn-primary animate-pulse" : "btn-ghost"}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${listening ? "bg-white" : "bg-bad"}`} />
      {listening ? "Listening… tap to stop" : label}
    </button>
  );
}
