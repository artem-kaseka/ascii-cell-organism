#!/home/artem/.local/share/uv/tools/playwright/bin/python
"""
Deterministic 1080p60 capture & procedural audio pipeline for SOMATYPE // 01.

Usage:
  ./capture.py preview              # Render 6 inspection stills + benchmark + determinism check
  ./capture.py batch 0 300 b0.mkv   # Render frames [start, end) into lossless segment via ffmpeg pipe
  ./capture.py audio audio.wav      # Synthesize original 15.0s 48kHz stereo procedural soundtrack
  ./capture.py encode               # Concatenate batches + audio -> ascii-cell-organism-1080p60.mp4
"""

import argparse
import functools
import hashlib
import http.server
import math
import os
import socketserver
import struct
import subprocess
import sys
import threading
import time
import wave
from pathlib import Path

from playwright.sync_api import sync_playwright

PROJECT_DIR = Path(__file__).resolve().parent
FPS = 60
TOTAL_FRAMES = 900  # 15.0 seconds
DURATION_SEC = TOTAL_FRAMES / FPS
WIDTH = 1920
HEIGHT = 1080


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def start_local_server(directory: Path):
    handler = functools.partial(QuietHandler, directory=str(directory))
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd, port


def open_capture_page(playwright, port: int):
    browser = playwright.chromium.launch(
        headless=True,
        args=[
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--font-render-hinting=none",
        ],
    )
    context = browser.new_context(
        viewport={"width": WIDTH, "height": HEIGHT},
        device_scale_factor=1,
    )
    page = context.new_page()
    page.goto(f"http://127.0.0.1:{port}/index.html?capture=1", wait_until="load")
    page.wait_for_function("() => window.__organism && window.__organism.renderFrame")
    return browser, context, page


def cmd_preview():
    stills_dir = PROJECT_DIR / "stills"
    stills_dir.mkdir(exist_ok=True)
    httpd, port = start_local_server(PROJECT_DIR)
    sample_frames = [
        (36, "preview_01_p1_hook.png"),
        (140, "preview_02_p1_flock.png"),
        (250, "preview_03_p2_amber.png"),
        (438, "preview_04_p3_heartbeat.png"),
        (630, "preview_05_p4_cyan.png"),
        (825, "preview_06_p5_spectral.png"),
    ]
    try:
        with sync_playwright() as pw:
            browser, context, page = open_capture_page(pw, port)

            # Benchmark live JS render speed across 60 consecutive frames
            bench_ms = page.evaluate(
                """() => {
                    const org = window.__organism;
                    const t0 = performance.now();
                    for (let f = 0; f < 60; f++) {
                        org.renderFrame(f);
                    }
                    return performance.now() - t0;
                }"""
            )
            avg_ms = bench_ms / 60.0
            print(f"[BENCH] 60 frames in {bench_ms:.1f} ms -> {avg_ms:.2f} ms/frame ({1000.0/avg_ms:.1f} fps potential)")

            # Determinism check: render frame 250 sequentially vs after reset
            page.evaluate("() => window.__organism.renderFrame(250)")
            png_a = page.screenshot(type="png")
            hash_a = hashlib.sha256(png_a).hexdigest()

            page.evaluate("() => { window.__organism.enableCaptureMode(); window.__organism.renderFrame(250); }")
            png_b = page.screenshot(type="png")
            hash_b = hashlib.sha256(png_b).hexdigest()
            print(f"[DETERMINISM] frame 250 hash match: {hash_a == hash_b} ({hash_a[:16]})")
            if hash_a != hash_b:
                raise RuntimeError("Non-deterministic frame output detected!")

            # Reset and capture inspection stills
            page.evaluate("() => window.__organism.enableCaptureMode()")
            for frame_idx, fname in sample_frames:
                tel = page.evaluate("(f) => window.__organism.renderFrame(f)", frame_idx)
                out_path = stills_dir / fname
                page.screenshot(path=str(out_path), type="png")
                print(f"[STILL] frame {frame_idx:3d} (t={tel['time']:5.2f}s) preset {tel['preset']} ({tel['presetName']}) ptr={tel['pointer']} beat={tel['beat']} -> {out_path.name}")

            browser.close()
    finally:
        httpd.shutdown()


def cmd_batch(start_frame: int, end_frame: int, out_path: Path):
    httpd, port = start_local_server(PROJECT_DIR)
    ffmpeg_cmd = [
        "ffmpeg",
        "-y",
        "-loglevel", "error",
        "-f", "image2pipe",
        "-vcodec", "png",
        "-framerate", str(FPS),
        "-i", "-",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "0",
        "-pix_fmt", "rgb24",
        str(out_path),
    ]
    proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE)
    t0 = time.monotonic()
    count = end_frame - start_frame
    try:
        with sync_playwright() as pw:
            browser, context, page = open_capture_page(pw, port)
            for idx, frame in enumerate(range(start_frame, end_frame)):
                page.evaluate("(f) => window.__organism.renderFrame(f)", frame)
                png_bytes = page.screenshot(type="png")
                proc.stdin.write(png_bytes)
                if (idx + 1) % 60 == 0 or (idx + 1) == count:
                    dt = time.monotonic() - t0
                    fps_eff = (idx + 1) / max(dt, 1e-3)
                    print(f"[BATCH {start_frame:03d}-{end_frame:03d}] {idx + 1:3d}/{count} frames ({dt:.1f}s, {fps_eff:.1f} f/s)", flush=True)
            browser.close()
    finally:
        if proc.stdin:
            proc.stdin.close()
        ret = proc.wait()
        httpd.shutdown()
        if ret != 0:
            raise RuntimeError(f"ffmpeg batch encode failed with exit code {ret}")
    print(f"[BATCH DONE] {out_path} ({out_path.stat().st_size / (1024*1024):.2f} MB)")


def cmd_audio(out_wav: Path):
    """
    Synthesize an original 15.0s, 48kHz stereo procedural ambient soundscape:
    - Warm deep abyssal breath drone (filtered harmonic sines shifting across 5 presets)
    - Soft low-frequency lub-dub heartbeat synced to the exact visual heartHz of each preset
    - Gentle crystalline harmonic chime blooms on preset transitions (3s, 6s, 9s, 12s)
    - Subtle stereo shimmer modulated by the scripted motion energy
    """
    sr = 48000
    n_samples = int(round(DURATION_SEC * sr))

    # Preset musical roots (Hz) and heartbeat rates matching organism.js PRESETS
    preset_roots = [55.0, 61.74, 49.0, 65.41, 58.27]  # A1, B1, G1, C2, Bb1
    preset_heart_hz = [1.18, 1.02, 1.38, 1.46, 1.12]
    preset_breath_rate = [1.48, 1.15, 1.32, 1.85, 1.22]
    chime_times = [3.0, 6.0, 9.0, 12.0]
    chime_freqs = [329.63, 392.00, 440.00, 523.25]  # E4, G4, A4, C5

    # Phase accumulators for smooth continuous pitch transitions
    ph_base = 0.0
    ph_fifth = 0.0
    ph_oct = 0.0
    ph_shimmer_l = 0.0
    ph_shimmer_r = 0.0
    ph_sub = 0.0

    # Simple 1-pole low-pass filter state for warm analog tone
    lp_l = 0.0
    lp_r = 0.0

    frames = bytearray(n_samples * 4)  # 16-bit stereo PCM
    two_pi = 2.0 * math.pi

    for i in range(n_samples):
        t = i / sr
        seg = min(4, int(t // 3.0))
        seg_t = t - seg * 3.0

        # Smooth crossfade parameters over 0.36s matching visual preset morph
        if seg > 0 and seg_t < 0.36:
            u = seg_t / 0.36
            u = u * u * (3.0 - 2.0 * u)
            root = preset_roots[seg - 1] * (1.0 - u) + preset_roots[seg] * u
            h_hz = preset_heart_hz[seg - 1] * (1.0 - u) + preset_heart_hz[seg] * u
            b_rate = preset_breath_rate[seg - 1] * (1.0 - u) + preset_breath_rate[seg] * u
        else:
            root = preset_roots[seg]
            h_hz = preset_heart_hz[seg]
            b_rate = preset_breath_rate[seg]

        # Breathing amplitude swell
        b_phase = t * b_rate
        breath = 0.5 + 0.5 * math.sin(b_phase - 0.28 * math.sin(b_phase))

        # Heartbeat lub-dub envelope synced directly to visual computeHeartbeat(t, heartHz)
        beat_phase = (t * h_hz) % 1.0
        lub = math.exp(-((beat_phase - 0.08) / 0.028) ** 2)
        dub = 0.62 * math.exp(-((beat_phase - 0.23) / 0.034) ** 2)
        # Emphasize cardiac pulse during preset 3 (6-9s)
        heart_gain = 0.34 if seg == 2 else 0.22

        # Advance oscillator phases
        ph_base += two_pi * root / sr
        ph_fifth += two_pi * (root * 1.498) / sr
        ph_oct += two_pi * (root * 2.0) / sr
        ph_shimmer_l += two_pi * (root * 4.005) / sr
        ph_shimmer_r += two_pi * (root * 3.995) / sr
        # Pitch-dropping sub-thump for organic heartbeat
        sub_freq = 44.0 + 26.0 * (lub + 0.6 * dub)
        ph_sub += two_pi * sub_freq / sr

        # Ambient drone pad
        pad_core = (
            0.48 * math.sin(ph_base)
            + 0.26 * math.sin(ph_fifth)
            + 0.16 * math.sin(ph_oct)
        ) * (0.14 + 0.10 * breath)

        # Gentle stereo bioluminescent shimmer
        pan_mod = math.sin(t * 0.9)
        shim_amp = 0.045 * (0.5 + 0.5 * breath)
        shim_l = math.sin(ph_shimmer_l) * shim_amp * (1.0 + 0.25 * pan_mod)
        shim_r = math.sin(ph_shimmer_r) * shim_amp * (1.0 - 0.25 * pan_mod)

        # Heartbeat thump
        heart_sig = math.sin(ph_sub) * (lub + dub) * heart_gain

        # Preset transition crystalline chimes
        chime_l = 0.0
        chime_r = 0.0
        for idx, ct in enumerate(chime_times):
            dt_c = t - ct
            if 0.0 <= dt_c < 2.2:
                env = math.exp(-dt_c * 2.4) * min(1.0, dt_c / 0.015)
                cf = chime_freqs[idx]
                c_tone = (
                    0.65 * math.sin(two_pi * cf * dt_c)
                    + 0.35 * math.sin(two_pi * (cf * 1.5) * dt_c)
                ) * env * 0.11
                pan = -0.35 if idx % 2 == 0 else 0.35
                chime_l += c_tone * (1.0 - pan)
                chime_r += c_tone * (1.0 + pan)

        raw_l = pad_core + shim_l + heart_sig + chime_l
        raw_r = pad_core + shim_r + heart_sig + chime_r

        # Warm 1-pole lowpass smoothing
        alpha = 0.18 + 0.12 * breath
        lp_l += alpha * (raw_l - lp_l)
        lp_r += alpha * (raw_r - lp_r)

        # Global fade-in (0.45s) and fade-out (0.75s)
        fade = 1.0
        if t < 0.45:
            fade = t / 0.45
        elif t > DURATION_SEC - 0.75:
            fade = max(0.0, (DURATION_SEC - t) / 0.75)

        out_l = math.tanh(lp_l * fade * 1.15) * 0.82
        out_r = math.tanh(lp_r * fade * 1.15) * 0.82

        s_l = max(-32767, min(32767, int(round(out_l * 32767))))
        s_r = max(-32767, min(32767, int(round(out_r * 32767))))
        struct.pack_into("<hh", frames, i * 4, s_l, s_r)

    with wave.open(str(out_wav), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(frames)

    print(f"[AUDIO DONE] {out_wav} ({n_samples} samples, {DURATION_SEC:.2f}s, 48kHz stereo)")


def cmd_encode(batches, audio_wav: Path, out_mp4: Path):
    concat_file = PROJECT_DIR / "_concat_list.txt"
    with open(concat_file, "w") as f:
        for b in batches:
            f.write(f"file '{Path(b).resolve()}'\n")

    cmd = [
        "ffmpeg",
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", str(concat_file),
        "-i", str(audio_wav),
        "-c:v", "libx264",
        "-profile:v", "high",
        "-preset", "slow",
        "-crf", "20",
        "-maxrate", "17M",
        "-bufsize", "34M",
        "-pix_fmt", "yuv420p",
        "-r", str(FPS),
        "-c:a", "aac",
        "-ar", "48000",
        "-ac", "2",
        "-b:a", "192k",
        "-movflags", "+faststart",
        "-shortest",
        str(out_mp4),
    ]
    print("[ENCODE] Running:", " ".join(cmd))
    subprocess.run(cmd, check=True)
    concat_file.unlink(missing_ok=True)
    print(f"[ENCODE DONE] {out_mp4} ({out_mp4.stat().st_size / (1024*1024):.2f} MB)")


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("preview")

    p_batch = sub.add_parser("batch")
    p_batch.add_argument("start", type=int)
    p_batch.add_argument("end", type=int)
    p_batch.add_argument("out", type=Path)

    p_audio = sub.add_parser("audio")
    p_audio.add_argument("out", type=Path)

    p_enc = sub.add_parser("encode")
    p_enc.add_argument("--batches", nargs="+", required=True)
    p_enc.add_argument("--audio", type=Path, required=True)
    p_enc.add_argument("--out", type=Path, required=True)

    args = parser.parse_args()
    if args.cmd == "preview":
        cmd_preview()
    elif args.cmd == "batch":
        cmd_batch(args.start, args.end, args.out)
    elif args.cmd == "audio":
        cmd_audio(args.out)
    elif args.cmd == "encode":
        cmd_encode(args.batches, args.audio, args.out)


if __name__ == "__main__":
    main()
