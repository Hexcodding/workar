"""
Проверка сайдкара без интерфейса: гоним готовый файл через ffmpeg
в тот же PCM-поток, который будет слать Electron.

    python stt/_test_client.py --file materials/mentor/audio/xxx.ogg --seconds 45
"""

import argparse
import asyncio
import json
import subprocess

import websockets

CHUNK_BYTES = 3200  # 0.1 сек при 16 кГц Int16


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    parser.add_argument("--seconds", type=float, default=45)
    parser.add_argument("--port", type=int, default=8756)
    # по умолчанию гоним в темпе живого разговора: если слать быстрее,
    # куски копятся в очереди и задержка меряется неправдой
    parser.add_argument("--speed", type=float, default=1.0)
    args = parser.parse_args()

    ff = subprocess.Popen(
        [
            "ffmpeg", "-v", "quiet", "-i", args.file,
            "-t", str(args.seconds),
            "-f", "s16le", "-ac", "1", "-ar", "16000", "-",
        ],
        stdout=subprocess.PIPE,
    )

    async with websockets.connect(f"ws://127.0.0.1:{args.port}", max_size=None) as ws:
        async def reader() -> None:
            async for msg in ws:
                data = json.loads(msg)
                if data["type"] == "final":
                    print(f"[{data['id']}, {data['ms']} мс] {data['text']}")
                elif data["type"] == "revision":
                    # без ascii-стрелки консоль Windows роняет читателя на кодировке
                    print(f"[{data['id']} уточнено] {data['text']}")
                elif data["type"] == "speech":
                    print("… говорит" if data["on"] else "… тишина")
                else:
                    print(f"[{data['type']}]")

        task = asyncio.create_task(reader())
        assert ff.stdout
        while True:
            chunk = ff.stdout.read(CHUNK_BYTES)
            if not chunk:
                break
            await ws.send(chunk)
            await asyncio.sleep(0.1 / args.speed)

        await ws.send(json.dumps({"type": "flush"}))
        await asyncio.sleep(20)
        task.cancel()

    ff.wait()


if __name__ == "__main__":
    asyncio.run(main())
