"""
Сравнение моделей на нашем же материале: точность против скорости.

Гоняем один и тот же кусок речи и смотрим, что модель слышит и сколько
времени тратит. Реальное время — 1x, всё выше 1.5x годится для звонка.

    python stt/_bench.py --seconds 60 --models small medium large-v3-turbo
"""

import argparse
import os
import time

os.environ.setdefault("NO_PROXY", "*")
os.environ.setdefault("no_proxy", "*")

from faster_whisper import WhisperModel  # noqa: E402

DOMAIN_PROMPT = (
    "Разговор методиста онлайн-школы Парта с мамой школьника на диагностике. "
    "Успеваемость, тройки, оценки, домашка, репетитор, куратор, преподаватель, "
    "мотивация, внимание, память, концентрация, ОГЭ, ЕГЭ, точка Б, диагностика, "
    "рассрочка, оплата, мини-группа, профориентация, нейропсихолог."
)

ALIASES = {
    "large-v3-turbo": "deepdml/faster-whisper-large-v3-turbo-ct2",
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--file",
        default="materials/mentor/audio/audio_2026-08-01_23-39-42.ogg",
    )
    parser.add_argument("--seconds", type=float, default=60)
    parser.add_argument("--models", nargs="+", default=["small", "medium"])
    parser.add_argument("--threads", type=int, default=0)
    parser.add_argument("--out", default="stt/bench.txt")
    args = parser.parse_args()

    threads = args.threads or max(4, (os.cpu_count() or 8) // 2)
    report: list[str] = []

    def say(line: str) -> None:
        print(line, flush=True)
        report.append(line)

    say(f"файл: {args.file}, первые {args.seconds:.0f} сек, потоков {threads}\n")

    for name in args.models:
        repo = ALIASES.get(name, name)
        say(f"--- {name} ---")
        try:
            load_started = time.time()
            model = WhisperModel(repo, device="cpu", compute_type="int8", cpu_threads=threads)
            say(f"загрузка {time.time() - load_started:.0f} сек")
        except Exception as e:  # модель может не скачаться из этой сети
            say(f"не получилось: {e}\n")
            continue

        started = time.time()
        segments, info = model.transcribe(
            args.file,
            language="ru",
            beam_size=5,
            vad_filter=True,
            condition_on_previous_text=False,
            initial_prompt=DOMAIN_PROMPT,
            clip_timestamps=[0, args.seconds],
        )
        text = " ".join(s.text.strip() for s in segments)
        took = time.time() - started
        speed = min(info.duration, args.seconds) / max(took, 0.01)
        say(f"{took:.0f} сек на {args.seconds:.0f} сек аудио ({speed:.1f}x реального времени)")
        say(f"{text}\n")

    with open(args.out, "w", encoding="utf-8") as f:
        f.write("\n".join(report))
    print(f"OUT: {args.out}")


if __name__ == "__main__":
    main()
