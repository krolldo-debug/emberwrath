# Questpfad am Boden (Bereich B)

Umgesetzt in `world/QuestGuide.js` nach INTEGRATION.md §11.6. Ziel kommt von C (`game.progression.questTarget()`),
Grafik von D (`assets.effects.guide`), Schalter `game.prefs.get('guidePath', true)`.

- Öffentlich: `world.guidePath` (Array `{x, y}` in Weltpixeln, geglättet), `world.guide.goal` (`{x, y, label}`).
- Neuberechnung bei `quest:*`, `enemy:killed`, `object:interact` und alle 0,5 s.
- Ziel in anderer Zone: Breitensuche über `zone.links`, Pfad zum passenden Portal.
