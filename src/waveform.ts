// Minimal waveform visualization — communicates "audio is being received",
// not a music visualizer. Two modes: real mic analysis (host) and a pulse
// driven by activity ticks (listener, which has no raw audio to analyze).

export function attachMicWaveform(canvas: HTMLCanvasElement, analyser: AnalyserNode): () => void {
  const ctx = canvas.getContext("2d")!;
  const data = new Uint8Array(analyser.frequencyBinCount);
  let raf = 0;

  function draw() {
    raf = requestAnimationFrame(draw);
    analyser.getByteTimeDomainData(data);
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = getComputedStyle(canvas).color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const step = Math.max(1, Math.floor(data.length / width));
    for (let x = 0; x < width; x++) {
      const sample = data[x * step] ?? 128;
      const y = (sample / 255) * height;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  draw();
  return () => cancelAnimationFrame(raf);
}

/** ponytail: no audio stream reaches the listener (only translated text), so
 * this pulse reflects caption activity rather than real waveform data.
 * Upgrade path: derive real levels once/if audio playback is added. */
export function attachPulseWaveform(canvas: HTMLCanvasElement): { pulse(): void; stop(): void } {
  const ctx = canvas.getContext("2d")!;
  const bars = 24;
  const levels = new Array(bars).fill(0.08);
  let raf = 0;

  function draw() {
    raf = requestAnimationFrame(draw);
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = getComputedStyle(canvas).color;
    const barWidth = width / bars;
    for (let i = 0; i < bars; i++) {
      levels[i] *= 0.9; // decay
      const h = Math.max(2, levels[i] * height);
      ctx.fillRect(i * barWidth + 1, height - h, barWidth - 2, h);
    }
  }
  draw();

  return {
    pulse() {
      for (let i = 0; i < bars; i++) {
        levels[i] = Math.min(1, levels[i] + Math.random() * 0.9);
      }
    },
    stop() {
      cancelAnimationFrame(raf);
    },
  };
}
