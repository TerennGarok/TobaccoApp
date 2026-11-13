// Live camera capture with real-time document outline and optional auto-capture.
import { h, icon, iconBtn, toast } from '../ui';
import { detectDocument } from './detect';
import { Quad, dist } from './geometry';

export interface CameraResult {
  canvas: HTMLCanvasElement;
}

export interface CameraOptions {
  pageNumber: number;
  onCapture(c: HTMLCanvasElement): void;
  onGallery(): void;
  onClose(): void;
}

export function cameraView(opts: CameraOptions): { el: HTMLElement; stop(): void } {
  const video = h('video', { class: 'cam-video', playsinline: true, muted: true, autoplay: true });
  video.setAttribute('playsinline', '');
  video.muted = true;
  const overlay = h('canvas', { class: 'cam-overlay' });
  const hint = h('div', { class: 'cam-hint' }, 'Point the camera at a document');
  const counter = h('div', { class: 'cam-counter' }, `Page ${opts.pageNumber}`);
  let auto = localStorage.getItem('autoCapture') === '1';
  const autoBtn = h('button', { class: 'cam-chip' + (auto ? ' on' : ''), onclick: () => {
    auto = !auto;
    localStorage.setItem('autoCapture', auto ? '1' : '0');
    autoBtn.classList.toggle('on', auto);
    autoBtn.textContent = auto ? 'Auto capture: on' : 'Auto capture: off';
    stableSince = 0;
  } }, auto ? 'Auto capture: on' : 'Auto capture: off');
  let torchOn = false;
  const torchBtn = iconBtn('flash', 'Flash', async () => {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    try {
      torchOn = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: torchOn } as any] });
      torchBtn.classList.toggle('on', torchOn);
    } catch {
      toast('Flash is not available on this device');
    }
  }, 'cam-icon');
  torchBtn.style.visibility = 'hidden';

  const shutter = h('button', { class: 'shutter', 'aria-label': 'Capture', onclick: () => capture() }, h('span'));
  const el = h(
    'div',
    { class: 'camera' },
    h('div', { class: 'cam-stage' }, video, overlay, hint),
    h('div', { class: 'cam-top' }, iconBtn('x', 'Close camera', () => opts.onClose(), 'cam-icon'), counter, torchBtn),
    h('div', { class: 'cam-bottom' },
      h('div', { class: 'cam-chips' }, autoBtn),
      h('div', { class: 'cam-controls' },
        h('button', { class: 'cam-side', onclick: () => opts.onGallery() }, icon('image', 26), h('span', null, 'Photos')),
        shutter,
        h('div', { class: 'cam-side ghost' }),
      ),
    ),
  );

  let stream: MediaStream | null = null;
  let raf = 0;
  let timer: any = 0;
  let stopped = false;
  let lastQuad: Quad | null = null;
  let shown: Quad | null = null;
  let stableSince = 0;
  let capturing = false;
  const detCanvas = document.createElement('canvas');

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      hint.textContent = 'Camera not available here. Use Photos instead (HTTPS is required for camera access).';
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
      });
    } catch (e: any) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch {
        hint.textContent = e?.name === 'NotAllowedError' ? 'Camera permission denied. Allow camera access or use Photos.' : 'Could not start the camera. Use Photos instead.';
        return;
      }
    }
    if (stopped) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      /* autoplay may need gesture; usually fine since user tapped */
    }
    const track = stream.getVideoTracks()[0];
    const caps: any = track.getCapabilities?.() || {};
    if (caps.torch) torchBtn.style.visibility = 'visible';
    try {
      if (caps.focusMode?.includes?.('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
    } catch {
      /* ignore */
    }
    loopDetect();
    draw();
  }

  function loopDetect() {
    if (stopped) return;
    if (video.videoWidth && !capturing) {
      const vw = video.videoWidth, vh = video.videoHeight;
      const s = 280 / Math.max(vw, vh);
      detCanvas.width = Math.round(vw * s);
      detCanvas.height = Math.round(vh * s);
      detCanvas.getContext('2d')!.drawImage(video, 0, 0, detCanvas.width, detCanvas.height);
      const q = detectDocument(detCanvas, detCanvas.width, detCanvas.height, 280);
      const prev = lastQuad;
      lastQuad = q ? (q.map((p) => ({ x: p.x / s, y: p.y / s })) as Quad) : null;
      if (lastQuad) {
        hint.textContent = auto ? 'Hold steady…' : 'Document found — tap to capture';
        const diag = Math.hypot(vw, vh);
        const moved = prev ? Math.max(...lastQuad.map((p, i) => dist(p, prev[i]))) / diag : 1;
        if (moved < 0.02) {
          if (!stableSince) stableSince = performance.now();
          else if (auto && performance.now() - stableSince > 1300) {
            stableSince = 0;
            capture();
          }
        } else stableSince = 0;
      } else {
        stableSince = 0;
        hint.textContent = 'Point the camera at a document';
      }
    }
    timer = setTimeout(loopDetect, 160);
  }

  function draw() {
    if (stopped) return;
    const rect = video.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (overlay.width !== Math.round(rect.width * dpr) || overlay.height !== Math.round(rect.height * dpr)) {
      overlay.width = Math.round(rect.width * dpr);
      overlay.height = Math.round(rect.height * dpr);
    }
    const ctx = overlay.getContext('2d')!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (lastQuad && video.videoWidth) {
      // object-fit: cover mapping
      const vw = video.videoWidth, vh = video.videoHeight;
      const s = Math.max(rect.width / vw, rect.height / vh);
      const ox = (rect.width - vw * s) / 2, oy = (rect.height - vh * s) / 2;
      const target = lastQuad.map((p) => ({ x: (p.x * s + ox) * dpr, y: (p.y * s + oy) * dpr })) as Quad;
      shown = shown ? (shown.map((p, i) => ({ x: p.x + (target[i].x - p.x) * 0.45, y: p.y + (target[i].y - p.y) * 0.45 })) as Quad) : target;
      ctx.beginPath();
      shown.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
      ctx.fill();
      ctx.lineWidth = 3 * dpr;
      ctx.strokeStyle = stableSince && auto ? '#22c55e' : '#38bdf8';
      ctx.stroke();
    } else shown = null;
    raf = requestAnimationFrame(draw);
  }

  async function grabFrame(): Promise<HTMLCanvasElement> {
    const track = stream?.getVideoTracks()[0];
    const IC = (window as any).ImageCapture;
    if (track && IC) {
      try {
        const ic = new IC(track);
        const blob: Blob = await Promise.race([
          ic.takePhoto(),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
        ]);
        const bmp = await createImageBitmap(blob);
        const c = document.createElement('canvas');
        const s = Math.min(1, 4096 / Math.max(bmp.width, bmp.height));
        c.width = Math.round(bmp.width * s);
        c.height = Math.round(bmp.height * s);
        c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
        bmp.close();
        return c;
      } catch {
        /* fall back to the video frame */
      }
    }
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext('2d')!.drawImage(video, 0, 0);
    return c;
  }

  async function capture() {
    if (capturing || !video.videoWidth) {
      if (!video.videoWidth) toast('Camera is not ready yet');
      return;
    }
    capturing = true;
    el.classList.add('flash-anim');
    try {
      const c = await grabFrame();
      opts.onCapture(c);
    } finally {
      setTimeout(() => el.classList.remove('flash-anim'), 250);
      capturing = false;
    }
  }

  function stop() {
    stopped = true;
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  start();
  return { el, stop };
}
