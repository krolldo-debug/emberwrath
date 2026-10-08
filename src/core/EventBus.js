// Minimaler Pub/Sub-Bus. Systeme kommunizieren über Events statt direkter
// Referenzen (z. B. Combat -> "hit" -> Feedback, Audio, UI).
// Alle Event-Namen stehen in core/events.js und docs/INTEGRATION.md.
export class EventBus {
  constructor() {
    this.handlers = new Map();
  }
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }
  emit(type, payload) {
    const set = this.handlers.get(type);
    if (set) for (const fn of [...set]) fn(payload);
  }
  // Gebündelte Abos, die gemeinsam wieder gelöst werden (z. B. pro Spielsitzung).
  // scope.on(...) wie bus.on, scope.emit geht an den ganzen Bus, scope.dispose() löst alles.
  scope() {
    const offs = [];
    return {
      // Einzeln gelöste Abos verlassen auch die Sammelliste – sonst hält sie die Hörer (und z. B. jede
      // besuchte World samt Leinwänden über QuestGuide) bis zum Ende der Sitzung fest.
      on: (type, fn) => {
        const off = this.on(type, fn);
        const once = () => { off(); const i = offs.indexOf(once); if (i >= 0) offs.splice(i, 1); };
        offs.push(once);
        return once;
      },
      emit: (type, payload) => this.emit(type, payload),
      dispose: () => { for (const off of offs.splice(0)) off(); },
    };
  }
}
