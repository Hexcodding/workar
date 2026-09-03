# Workar

**AI sales copilot for live calls** — desktop overlay (Electron + React + TypeScript).

Подсказки по ходу разговора, база знаний из фраз/возражений, чек-лист этапов сделки, таймер и заметки для куратора. API-ключ хранится локально, в репозиторий не попадает.

> MVP / portfolio project. Собран с помощью AI-инструментов (Cursor) + ручной архитектуры, ревью и доводки до рабочего билда.

![stack](https://img.shields.io/badge/Electron-desktop-47848F?logo=electron&logoColor=white)
![stack](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![stack](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![stack](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)

---

## Что умеет

- **Brain (LLM)** — в реальном времени: этап звонка, главный ход, готовые фразы, алерты
- **Knowledge pack** — поиск по фразам, возражениям, вопросам (BM25 + эвристики)
- **Чек-лист** эталонного пути продажи + таймер встречи
- **Оверлей** поверх других окон (удобно рядом с браузерным созвоном)
- Локальные настройки провайдера / API key (не коммитятся)

---

## Стек

| Слой | Технологии |
|------|------------|
| Desktop | Electron |
| UI | React 19, TypeScript, Vite |
| AI | OpenAI-compatible API (ключ в UI) |
| Search | свой BM25 по русскому тексту |
| STT | опциональный локальный сервер в `stt/` |

---

## Быстрый старт

```bash
npm install
npm run dev
```

Откроется окно Electron. Для Brain — вставь API key в настройках приложения.

Только UI без Electron:

```bash
npm run build
npm run preview
```

---

## Что сделал я / что ускорил AI

| Я | AI (Cursor) |
|---|-------------|
| Архитектура: Electron + React, stores, brain pipeline | Черновики компонентов и обвязки |
| Логика этапов продажи, гейты цены, алерты | Бойлерплейт TypeScript / CSS |
| BM25 и русская токенизация | Ускорение рутинных правок |
| Ревью, отладка, доведение до `npm run dev` | Генерация кусков по промпту |

---

## Структура

```
workar/
├── electron/          # main + preload
├── src/
│   ├── components/    # UI
│   ├── data/          # playbook, demo knowledge, prompts
│   ├── lib/           # brain, BM25, helpers
│   └── store/         # settings & memory
├── stt/               # optional speech-to-text helper
└── package.json
```

В публичном репо — **демо** `knowledge.json` (без реальных транскриптов звонков).

---

## Важно про приватность

- Не коммить `materials/`, логи звонков, `.env`, API keys
- Ключ вводится только в UI и живёт локально

---

## Author

**Hexcodding** · AI / vibe-coding  
GitHub: [Hexcodding](https://github.com/Hexcodding) · Telegram: [@hexaround](https://t.me/hexaround)
