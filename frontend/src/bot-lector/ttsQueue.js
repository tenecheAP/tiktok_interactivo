/**
 * Cola de síntesis de voz (Web Speech API), una frase a la vez.
 */
export class TtsQueue {
  constructor() {
    this._items = [];
    this._speaking = false;
    this._paused = false;
    this._params = {
      rate: 1,
      pitch: 1,
      volume: 1,
      voice: null,
      lang: 'es-ES',
    };
  }

  /** @param {Partial<{ rate: number, pitch: number, volume: number, voice: SpeechSynthesisVoice | null, lang: string }>} p */
  setParams(p) {
    this._params = { ...this._params, ...p };
  }

  getParams() {
    return { ...this._params, voice: this._params.voice };
  }

  get paused() {
    return this._paused;
  }

  /**
   * @param {string} text
   * @param {number} [priority]
   */
  speak(text, priority = 0) {
    this._items.push({ text, priority });
    this._items.sort((a, b) => b.priority - a.priority);
    this._drain();
  }

  _drain() {
    if (this._paused || this._speaking || this._items.length === 0) return;
    const { text } = this._items.shift();
    this._speaking = true;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = this._params.rate;
    u.pitch = this._params.pitch;
    u.volume = this._params.volume;
    u.lang = this._params.lang || 'es-ES';
    if (this._params.voice) {
      u.voice = this._params.voice;
    }
    const done = () => {
      this._speaking = false;
      this._drain();
    };
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.speak(u);
  }

  pause() {
    this._paused = true;
    window.speechSynthesis.cancel();
    this._speaking = false;
  }

  resume() {
    this._paused = false;
    this._drain();
  }

  flush() {
    this._items = [];
    window.speechSynthesis.cancel();
    this._speaking = false;
  }

  /**
   * Voces en español (para selector).
   * @param {SpeechSynthesisVoice[]} voices
   */
  static listSpanishVoices(voices) {
    return voices.filter(
      (v) =>
        /^es(-|$)/i.test(v.lang) ||
        /español|spanish|spain|mexico|es-/i.test(v.name + v.lang)
    );
  }

  /**
   * Heurística voz “femenina” (mejor esfuerzo según nombres del SO).
   * @param {SpeechSynthesisVoice[]} voices
   */
  static pickFemaleSpanishVoice(voices) {
    const es = TtsQueue.listSpanishVoices(voices);
    const femaleHints =
      /female|femenina|mujer|woman|es-es.*linda|elsa|helena|soledad|monica|paula|laura|maria/i;
    const hit = es.find((v) => femaleHints.test(v.name));
    return hit || es[0] || null;
  }
}
