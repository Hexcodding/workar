"""
Локальный распознаватель речи родителя.

Зачем: на звонке Егор в наушниках, поэтому микрофон слышит только его.
Речь мамы идёт в системный звук, его петлю ловит Electron и шлёт сюда
сырым PCM, а обратно получает текст. Ничего не уходит в интернет.

Распознаём в два прохода. Быстрая модель отвечает за 2–3 секунды, чтобы
подсказка успевала к живому разговору. Точная модель тратит на короткую
реплику те же 6–7 секунд, что и на полминуты речи (whisper всё равно
прогоняет 30-секундное окно), поэтому она переслушивает накопленное
пачками и присылает исправления — так она успевает за разговором и вдобавок
слышит фразу в контексте соседних.

Протокол (WebSocket, 127.0.0.1):
    клиент → сервер: бинарные кадры Int16 LE, моно, 16 кГц
                     текст '{"type":"flush"}' — досказать текущий кусок
    сервер → клиент: {"type":"ready"}      модель загружена
                     {"type":"speech", "on": true|false}
                     {"type":"final", "id": "mic-3", "text": "...", "ms": 1234}
                     {"type":"revision", "id": "mic-3", "text": "..."}

Запуск: python stt/server.py --port 8756 --model small --exact large-v3-turbo
"""

import argparse
import asyncio
import json
import logging
import os
import re
import sys
import time

# любая проверка порта без HTTP-рукопожатия иначе печатает трейсбек в лог приложения
logging.getLogger("websockets.server").setLevel(logging.CRITICAL)

os.environ.setdefault("NO_PROXY", "*")
os.environ.setdefault("no_proxy", "*")

import numpy as np  # noqa: E402
import websockets  # noqa: E402
from faster_whisper import WhisperModel  # noqa: E402

SAMPLE_RATE = 16000
BYTES_PER_SAMPLE = 2

MODELS = {
    "large-v3-turbo": "deepdml/faster-whisper-large-v3-turbo-ct2",
}

# Замеры на нашем материале (stt/_bench.py, 12 потоков): на коротких репликах
# решает не «скорость относительно реального времени», а размер модели —
# whisper всё равно прогоняет 30-секундное окно.
#   small           2–3 сек на реплику, путает слова
#   large-v3-turbo  6–7 сек на реплику, слышит почти всё
# Поэтому small отвечает вживую, turbo переслушивает пачками.
DEFAULT_FAST = "small"
DEFAULT_EXACT = "large-v3-turbo"

# Пачка для точного прохода: столько речи копим перед пересдачей.
# Больше окна whisper не берём, иначе он режет сам и путает время.
BATCH_SEC = 25.0
# Между репликами кладём тишину, чтобы модель не склеивала их в одну фразу
BATCH_GAP_SEC = 0.4

# Луч шире одного варианта заметно вытягивает окончания и термины,
# а на коротких репликах стоит всего десятки миллисекунд
BEAM_SIZE = 5

# Границы куска: слишком короткие обрывки модель домысливает,
# слишком длинные задерживают подсказку на звонке
MIN_SEGMENT_SEC = 0.7
MAX_SEGMENT_SEC = 8.0
SILENCE_TO_CUT_SEC = 0.6

# Модель не знает нашей лексики, и «диагностика» превращается в «диагнозчик».
# Подсказка со словарём темы заметно выправляет именно эти слова.
DOMAIN_PROMPT = (
    "Разговор методиста онлайн-школы Парта с мамой школьника на диагностике. "
    "Успеваемость, тройки, оценки, домашка, репетитор, куратор, преподаватель, "
    "мотивация, внимание, память, концентрация, ОГЭ, ЕГЭ, точка Б, диагностика, "
    "рассрочка, оплата, мини-группа, профориентация, нейропсихолог."
)

# Тишину whisper любит заполнять титрами и благодарностями за просмотр
HALLUCINATIONS = (
    "продолжение следует",
    "субтитры",
    "редактор субтитров",
    "спасибо за просмотр",
    "подписывайтесь",
    "добавляйте в закладки",
    "корректор",
    "www.",
    "ставьте лайк",
)


# Ошибки, которые модель делает раз за разом на одних и тех же наших словах
FIXES = (
    (re.compile(r"\bдиагно[зс][тч]ик\w*", re.I), "диагностику"),
    (re.compile(r"\bдиагно[зс]тик[еи]\b", re.I), "диагностике"),
    (re.compile(r"\bо\s?г\s?э\b", re.I), "ОГЭ"),
    (re.compile(r"\bе\s?г\s?э\b", re.I), "ЕГЭ"),
    (re.compile(r"\bточк[ауи]\s+б[еэ]\b", re.I), "точка Б"),
    (re.compile(r"\bпрефронтальн", re.I), "префронтальн"),
    (re.compile(r"\bмини\s?групп", re.I), "мини-групп"),
)


def polish(text: str) -> str:
    for pattern, repl in FIXES:
        text = pattern.sub(repl, text)
    return text


def is_junk(text: str) -> bool:
    low = text.lower().strip(" .,!?—-")
    if len(low) < 2:
        return True
    return any(h in low for h in HALLUCINATIONS)


def normalize(audio: np.ndarray, target: float = 0.06) -> np.ndarray:
    """Петля системного звука бывает тихой, а на тихом модель угадывает хуже."""
    rms = float(np.sqrt(np.mean(np.square(audio)))) if audio.size else 0.0
    if rms < 1e-5:
        return audio
    gain = min(target / rms, 8.0)
    if gain <= 1.05:
        return audio
    return np.clip(audio * gain, -1.0, 1.0)


class Segmenter:
    """Режет поток на реплики по паузам, чтобы не гонять модель вхолостую."""

    def __init__(self, threshold: float = 0.006) -> None:
        self.threshold = threshold
        self.buffer = np.zeros(0, dtype=np.float32)
        self.speech = False
        self.silence = 0.0
        self.speech_len = 0.0

    def feed(self, chunk: np.ndarray) -> tuple[np.ndarray | None, bool | None]:
        """Возвращает готовый кусок речи и смену состояния «говорят/тихо»."""
        rms = float(np.sqrt(np.mean(np.square(chunk)))) if chunk.size else 0.0
        seconds = chunk.size / SAMPLE_RATE
        loud = rms >= self.threshold
        changed: bool | None = None

        if loud:
            if not self.speech:
                self.speech = True
                changed = True
            self.silence = 0.0
            self.speech_len += seconds
        else:
            if self.speech:
                self.silence += seconds
            # немного тишины держим в буфере, иначе начало слова обрубается
            elif self.buffer.size > int(SAMPLE_RATE * 0.5):
                self.buffer = self.buffer[-int(SAMPLE_RATE * 0.5) :]

        self.buffer = np.concatenate([self.buffer, chunk])

        total = self.buffer.size / SAMPLE_RATE
        ended = self.speech and self.silence >= SILENCE_TO_CUT_SEC
        overflow = self.speech and total >= MAX_SEGMENT_SEC
        if not (ended or overflow):
            return None, changed

        segment = self.buffer
        keep = int(SAMPLE_RATE * 0.2) if overflow else 0
        self.buffer = segment[-keep:] if keep else np.zeros(0, dtype=np.float32)
        if ended:
            self.speech = False
            changed = False
        self.silence = 0.0
        short = self.speech_len < MIN_SEGMENT_SEC
        self.speech_len = 0.0
        return (None, changed) if short else (segment, changed)

    def flush(self) -> np.ndarray | None:
        if self.speech_len < MIN_SEGMENT_SEC:
            return None
        segment = self.buffer
        self.buffer = np.zeros(0, dtype=np.float32)
        self.speech = False
        self.speech_len = 0.0
        self.silence = 0.0
        return segment


def log(message: str) -> None:
    print(message, flush=True)


# Разговор живёт только в памяти окна: стоит приложению перезапуститься —
# и разбирать после звонка нечего. Поэтому каждую распознанную реплику
# дублируем на диск, одним файлом на день.
LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "logs")


def record(channel: str, kind: str, text: str) -> None:
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        stamp = time.strftime("%Y-%m-%d")
        with open(os.path.join(LOG_DIR, f"{stamp}.log"), "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%H:%M:%S')}\t{channel}\t{kind}\t{text}\n")
    except OSError as err:
        # запись в файл не должна ронять распознавание на живом звонке
        log(f"не пишется лог: {err}")


def same_words(a: str, b: str) -> bool:
    """Правку шлём только когда изменились слова, а не запятые и регистр."""
    clean = lambda s: re.sub(r"[^\w\s]", "", s.lower().replace("ё", "е")).split()  # noqa: E731
    return clean(a) == clean(b)


class Engine:
    """
    Две модели на общих ядрах: быстрая держит темп разговора,
    точная догоняет её и присылает исправления.
    """

    def __init__(self, fast_name: str, exact_name: str | None, threads: int) -> None:
        # быстрой отдаём больше ядер: от неё зависит задержка подсказки
        fast_threads = max(2, threads - threads // 3) if exact_name else threads
        log(f"загружаю быструю модель {fast_name} ({fast_threads} потоков)…")
        self.fast = WhisperModel(
            MODELS.get(fast_name, fast_name),
            device="cpu",
            compute_type="int8",
            cpu_threads=fast_threads,
        )
        self.fast_lock = asyncio.Lock()
        self.exact: WhisperModel | None = None
        self.exact_lock = asyncio.Lock()
        self.exact_name = exact_name
        self.exact_threads = max(2, threads - fast_threads)

    async def load_exact(self) -> None:
        """Точная модель грузится фоном: звонок можно начинать сразу."""
        if not self.exact_name:
            return
        log(f"фоном загружаю точную модель {self.exact_name}…")
        self.exact = await asyncio.to_thread(
            lambda: WhisperModel(
                MODELS.get(self.exact_name, self.exact_name),
                device="cpu",
                compute_type="int8",
                cpu_threads=self.exact_threads,
            )
        )
        log("точная модель готова, исправления пошли")

    async def pieces(
        self, model: WhisperModel, audio: np.ndarray, prompt: str, words: bool = False
    ) -> list[tuple[float, float, str]]:
        """
        Распознанный текст со временем. По словам — для точного прохода:
        пачка склеена из нескольких реплик, и разложить обратно можно
        только по времени, а фразы модель режет по-своему.
        """
        segments, _info = await asyncio.to_thread(
            lambda: model.transcribe(
                audio,
                language="ru",
                beam_size=BEAM_SIZE,
                vad_filter=False,
                condition_on_previous_text=False,
                initial_prompt=prompt,
                word_timestamps=words,
                # на обрывках фраз модель уходит в фантазии — режем по уверенности
                temperature=[0.0, 0.2, 0.4],
                compression_ratio_threshold=2.4,
                log_prob_threshold=-1.0,
                no_speech_threshold=0.6,
            )
        )
        out: list[tuple[float, float, str]] = []
        for s in segments:
            if words:
                out.extend((w.start, w.end, w.word.strip()) for w in (s.words or []) if w.word.strip())
            elif s.text.strip():
                out.append((s.start, s.end, s.text.strip()))
        return out

    async def run(self, model: WhisperModel, audio: np.ndarray, prompt: str) -> str:
        parts = await self.pieces(model, audio, prompt)
        return polish(" ".join(text for _s, _e, text in parts).strip())


async def handle(ws, engine: Engine) -> None:
    # микрофон и петля звука подключаются двумя отдельными соединениями
    path = getattr(getattr(ws, "request", None), "path", "") or ""
    channel = "mic" if "ch=mic" in path else "system"
    who = "егор" if channel == "mic" else "мама"

    log(f"подключился канал {channel}")
    seg = Segmenter()
    # последняя реплика этого же канала работает контекстом для следующей
    tail = ""
    counter = 0
    # накопленная пачка для точного прохода: кусок звука и чьи это реплики
    batch: list[np.ndarray] = []
    spans: list[tuple[str, float, float, str]] = []
    batch_sec = 0.0

    await ws.send(json.dumps({"type": "ready"}))

    def take_batch() -> tuple[np.ndarray, list[tuple[str, float, float, str]]] | None:
        nonlocal batch, spans, batch_sec
        if not batch:
            return None
        audio = np.concatenate(batch)
        marks = spans
        batch, spans, batch_sec = [], [], 0.0
        return audio, marks

    async def refine() -> None:
        """Переслушать пачку целиком и разложить услышанное обратно по репликам."""
        taken = take_batch()
        if taken is None or engine.exact is None:
            return
        audio, marks = taken

        async with engine.exact_lock:
            parts = await engine.pieces(engine.exact, audio, DOMAIN_PROMPT, words=True)

        # каждое слово отдаём той реплике, в чьё время попала его середина
        heard: dict[str, list[str]] = {uid: [] for uid, _s, _e, _t in marks}
        for start, end, word in parts:
            middle = (start + end) / 2
            near, distance = None, float("inf")
            for uid, s, e, _t in marks:
                gap = 0.0 if s <= middle <= e else min(abs(middle - s), abs(middle - e))
                if gap < distance:
                    near, distance = uid, gap
            # слово из чужой паузы дальше полусекунды — скорее всего домысел
            if near is not None and distance <= 0.5:
                heard[near].append(word)

        was = {uid: text for uid, _s, _e, text in marks}
        for uid, said in heard.items():
            text = polish(" ".join(said).strip())
            if not text or is_junk(text) or same_words(text, was[uid]):
                continue
            try:
                await ws.send(
                    json.dumps({"type": "revision", "id": uid, "text": text}, ensure_ascii=False)
                )
            except websockets.ConnectionClosed:
                return
            log(f"{who} (уточнено): {text}")
            record(who, "уточнено", text)

    async def recognize(raw: np.ndarray) -> None:
        nonlocal tail, counter, batch_sec
        started = time.time()
        audio = normalize(raw)
        prompt = f"{DOMAIN_PROMPT} {tail}".strip()[-600:]

        async with engine.fast_lock:
            text = await engine.run(engine.fast, audio, prompt)
        if not text or is_junk(text):
            return

        tail = text[-200:]
        counter += 1
        uid = f"{channel}-{counter}"
        log(f"{who}: {text}")
        record(who, "речь", text)
        await ws.send(
            json.dumps(
                {"type": "final", "id": uid, "text": text, "ms": int((time.time() - started) * 1000)},
                ensure_ascii=False,
            )
        )

        if engine.exact is None:
            return

        gap = np.zeros(int(SAMPLE_RATE * BATCH_GAP_SEC), dtype=np.float32)
        length = audio.size / SAMPLE_RATE
        spans.append((uid, batch_sec, batch_sec + length, text))
        batch.append(audio)
        batch.append(gap)
        batch_sec += length + BATCH_GAP_SEC

        if batch_sec >= BATCH_SEC:
            asyncio.create_task(refine())

    async for message in ws:
        if isinstance(message, str):
            try:
                cmd = json.loads(message)
            except json.JSONDecodeError:
                continue
            if cmd.get("type") == "flush":
                rest = seg.flush()
                if rest is not None:
                    await recognize(rest)
                # встреча заканчивается: досдаём хвост, чтобы запись была верной
                await refine()
            continue

        pcm = np.frombuffer(message, dtype=np.int16).astype(np.float32) / 32768.0
        segment, changed = seg.feed(pcm)
        if changed is not None:
            await ws.send(json.dumps({"type": "speech", "on": changed}))
        if segment is not None:
            await recognize(segment)

    log(f"канал {channel} отключился")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8756)
    parser.add_argument("--model", default=DEFAULT_FAST)
    parser.add_argument("--exact", default=DEFAULT_EXACT, help="'off' — без исправлений")
    args = parser.parse_args()

    exact = None if args.exact in ("off", "no", "") else args.exact
    engine = Engine(args.model, exact, os.cpu_count() or 8)
    log(f"модель готова, слушаю ws://127.0.0.1:{args.port}")
    asyncio.create_task(engine.load_exact())

    async with websockets.serve(
        lambda ws: handle(ws, engine),
        "127.0.0.1",
        args.port,
        max_size=None,
        ping_interval=20,
    ):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
