"""Short, locally generated phone sounds on the selected PulseAudio sink."""
import array
import asyncio
import contextlib
import json
import math
import sys

TONES = {
    'dial': [(1.4, (425,)), (0.1, ())],
    'ring': [(0.4, (440, 480)), (0.2, ()), (0.4, (440, 480)), (0.5, ()), (0.4, (440, 480))],
    'busy': [(0.35, (425,)), (0.35, ())] * 3,
}


async def pulse(*arguments):
    process = await asyncio.create_subprocess_exec('pactl', *arguments,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
    try:
        output, _ = await asyncio.wait_for(process.communicate(), timeout=3)
        if process.returncode:
            raise RuntimeError('PulseAudio unavailable')
        return output
    finally:
        if process.returncode is None:
            with contextlib.suppress(ProcessLookupError):
                process.kill()
            await process.wait()


def sink_id(device):
    if device is None:
        return None
    metadata = json.loads(device.metadata)
    value = metadata.get('id')
    if metadata.get('is_microphone') is not False or not isinstance(value, str) or not value or len(value) > 256:
        raise ValueError('Invalid speaker metadata')
    return value


def samples(kind):
    rate = 48000
    result = array.array('h')
    for duration, frequencies in TONES[kind]:
        count = round(duration * rate)
        for index in range(count):
            # Gentle level and 8 ms fades avoid clicks; no audio is recorded.
            envelope = min(1, index / 384, (count - index - 1) / 384)
            value = sum(math.sin(2 * math.pi * frequency * index / rate) for frequency in frequencies)
            result.append(round(0.18 * 32767 * envelope * value / max(1, len(frequencies))))
    if sys.byteorder != 'little':
        result.byteswap()
    return result.tobytes()


async def play(kind, device):
    sink = sink_id(device)
    if kind not in TONES or not sink:
        raise ValueError('Invalid sound or speaker')
    data = await asyncio.to_thread(samples, kind)
    process = await asyncio.create_subprocess_exec('paplay', '--raw', '--rate=48000', '--channels=1',
        '--format=s16le', '--client-name=HouseDash', '--stream-name=Telefon-Tonprobe', '--device=' + sink,
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
    try:
        await asyncio.wait_for(process.communicate(data), timeout=5)
        if process.returncode:
            raise RuntimeError('Audio playback failed')
    finally:
        if process.returncode is None:
            with contextlib.suppress(ProcessLookupError):
                process.kill()
            await process.wait()
