# Regenerates the fake-mic fixtures the e2e tests read from /tmp/jstest (Chrome loops them).
# play.wav: quiet-room hiss + violin-like notes that change pitch; quiet.wav: hiss only. No real recordings.
# Run: python3 test/make-wavs.py /tmp/jstest
import sys, os, math, random, struct, wave
out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/jstest'; os.makedirs(out, exist_ok=True)
SR, SEC = 48000, 91; random.seed(7)
NOTES = [196.0, 293.7, 440.0, 659.3, 392.0, 523.3, 349.2, 246.9]  # G3 D4 A4 E5 G4 C5 F4 B3
def hiss(): return random.gauss(0, 15)
def write(name, playing):
    w = wave.open(os.path.join(out, name), 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    buf = bytearray(); ph = 0.0
    for i in range(SR * SEC):
        t = i / SR; v = hiss()
        if playing and t >= 0.3:
            k = int((t - 0.3) / 1.0); u = (t - 0.3) - k
            if u < 0.9:
                f = NOTES[k % len(NOTES)] * (1 + 0.004 * math.sin(2 * math.pi * 5.5 * t))
                ph += 2 * math.pi * f / SR
                env = min(1, u / 0.05) * min(1, (0.9 - u) / 0.05) * (0.7 + 0.3 * math.sin(2 * math.pi * 1.3 * t))
                v += 5000 * env * sum(math.sin(h * ph) / h for h in range(1, 7))
        buf += struct.pack('<h', max(-32767, min(32767, int(v))))
    w.writeframes(bytes(buf)); w.close()
write('play.wav', True); write('quiet.wav', False)
