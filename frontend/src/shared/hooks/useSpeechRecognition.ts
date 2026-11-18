import { useCallback, useEffect, useRef, useState } from "react";

/* Types minimaux de la Web Speech API (absents de lib.dom). */
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly 0: RecognitionAlternative;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: ArrayLike<RecognitionResult>;
}
interface RecognitionErrorEvent {
  readonly error: string;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Accès au microphone refusé. Vérifiez les permissions du navigateur.",
  "audio-capture": "Aucun microphone détecté.",
  network: "Erreur réseau pendant la reconnaissance vocale.",
};

/**
 * Dictée vocale (fr-FR, continue). Seuls les résultats définitifs sont transmis,
 * comme dans la version d'origine.
 */
export function useSpeechRecognition(onFinalText: (text: string) => void, lang = "fr-FR") {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const callbackRef = useRef(onFinalText);
  const supported = getRecognitionCtor() !== null;

  useEffect(() => {
    callbackRef.current = onFinalText;
  }, [onFinalText]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("La reconnaissance vocale n'est pas supportée par ce navigateur.");
      return;
    }
    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result?.isFinal) callbackRef.current(result[0].transcript.trim());
      }
    };
    recognition.onerror = (event) => {
      // Comme en v1 : un silence n'est pas une erreur à signaler.
      if (event.error === "no-speech" || event.error === "aborted") return;
      setError(ERRORS[event.error] ?? `Erreur microphone : ${event.error}`);
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    try {
      recognition.start();
      recognitionRef.current = recognition;
      setError(null);
      setListening(true);
    } catch {
      setError("Impossible de démarrer le microphone. Vérifiez les permissions.");
    }
  }, [lang]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const toggle = useCallback(() => (listening ? stop() : start()), [listening, start, stop]);

  return { supported, listening, error, start, stop, toggle };
}
