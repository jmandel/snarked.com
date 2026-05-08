// Procedurally generated wave for the hero band.
// On load: pick random parameters for ~5 wave layers, each a sum of 3–4
// sine harmonics. Animate the harmonic phases for 500ms with a quadratic
// ease-out (waves "settle" to a halt), then freeze.

(() => {
  const host = document.querySelector(".sn-hero__wave");
  if (!host) return;

  const SVG_NS = "http://www.w3.org/2000/svg";
  const W = 1600;
  const H = 280;
  const STEPS = 96;

  const rand = (a, b) => a + Math.random() * (b - a);

  // Each layer is a horizontal band, built from N harmonics summed onto a
  // base Y. Some layers are stroked (atmosphere/engraving lines), some are
  // filled and closed to the bottom of the viewbox (the body of the sea).
  const layerSpecs = [
    // Atmospheric horizon hatch (4 thin lines, low amplitude)
    { baseY: 22,  fill: false, stroke: "#7DBEFF", strokeWidth: 0.6, opacity: 0.32, ampMax: 5,  harmonics: 3, phaseSpeedMax: 1.6 },
    { baseY: 38,  fill: false, stroke: "#7DBEFF", strokeWidth: 0.6, opacity: 0.28, ampMax: 5,  harmonics: 3, phaseSpeedMax: 1.6 },
    { baseY: 54,  fill: false, stroke: "#7DBEFF", strokeWidth: 0.55, opacity: 0.24, ampMax: 5,  harmonics: 3, phaseSpeedMax: 1.6 },
    { baseY: 70,  fill: false, stroke: "#7DBEFF", strokeWidth: 0.55, opacity: 0.20, ampMax: 5,  harmonics: 3, phaseSpeedMax: 1.6 },
    // Distant wave (fill)
    { baseY: 110, fill: "#0B3B91", opacity: 0.95, ampMax: 14, harmonics: 4, phaseSpeedMax: 2.6 },
    // Mid wave (fill, with hatched shading)
    { baseY: 142, fill: "#0B3B91", opacity: 1,    ampMax: 16, harmonics: 4, phaseSpeedMax: 3.0, hatch: true },
    // Mid wave engraving line (stroke that traces top of mid wave — uses same y values)
    { baseY: 142, fill: false, stroke: "#7DBEFF", strokeWidth: 1.4, opacity: 0.85, ampMax: 16, harmonics: 4, phaseSpeedMax: 3.0, mirrorOf: 5 },
    // Foreground wave (fill, deepest)
    { baseY: 178, fill: "#051845", opacity: 1,    ampMax: 18, harmonics: 4, phaseSpeedMax: 3.4 },
    // Foreground white-cap engraving line
    { baseY: 178, fill: false, stroke: "#FFFFFF", strokeWidth: 1.0, opacity: 0.55, ampMax: 18, harmonics: 4, phaseSpeedMax: 3.4, mirrorOf: 7 },
  ];

  const layers = layerSpecs.map((spec, i) => {
    if (spec.mirrorOf != null) {
      // Reuses harmonics from another layer so stroke lines exactly trace fills
      return { ...spec, harmonics: null, mirror: spec.mirrorOf };
    }
    return {
      ...spec,
      harmonics: Array.from({ length: spec.harmonics }, (_, k) => ({
        amp: rand(spec.ampMax * 0.35, spec.ampMax) / Math.pow(1.5, k), // taper higher harmonics
        freq: rand(0.0015, 0.012) * (1 + k * 0.6),
        phase: rand(0, Math.PI * 2),
        phaseSpeed: rand(-spec.phaseSpeedMax, spec.phaseSpeedMax),
      })),
    };
  });

  function ySamples(layer, t) {
    const harmonics = layer.harmonics ?? layers[layer.mirror].harmonics;
    const ys = new Float32Array(STEPS + 1);
    for (let i = 0; i <= STEPS; i++) {
      const x = (W * i) / STEPS;
      let y = layer.baseY;
      for (const h of harmonics) {
        y += h.amp * Math.sin(h.freq * x + h.phase + h.phaseSpeed * t);
      }
      ys[i] = y;
    }
    return ys;
  }

  // Where each filled wave should close to. We close above the bottom of
  // the SVG so the gradient bg's white shore shows through underneath.
  const FILL_BOTTOM = 215;

  function pathD(layer, t) {
    const ys = ySamples(layer, t);
    let d = `M ${(0).toFixed(2)} ${ys[0].toFixed(2)}`;
    for (let i = 1; i <= STEPS; i++) {
      const x = (W * i) / STEPS;
      d += ` L ${x.toFixed(2)} ${ys[i].toFixed(2)}`;
    }
    if (layer.fill) {
      d += ` L ${W} ${FILL_BOTTOM} L 0 ${FILL_BOTTOM} Z`;
    }
    return d;
  }

  // ----- Build the SVG ---------------------------------------------------
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");

  // Background wash: deep sea -> cream
  const defs = document.createElementNS(SVG_NS, "defs");
  defs.innerHTML = `
    <linearGradient id="wave-wash" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#0B3B91"/>
      <stop offset="55%" stop-color="#0B3B91"/>
      <stop offset="72%" stop-color="#1E4FC4"/>
      <stop offset="100%" stop-color="#FFFFFF"/>
    </linearGradient>
    <linearGradient id="wave-fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="white" stop-opacity="1"/>
      <stop offset="62%" stop-color="white" stop-opacity="1"/>
      <stop offset="92%" stop-color="white" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </linearGradient>
    <mask id="wave-bottomFade">
      <rect width="${W}" height="${H}" fill="url(#wave-fade)"/>
    </mask>
    <pattern id="wave-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
      <line x1="0" y1="0" x2="0" y2="6" stroke="#7DBEFF" stroke-width="0.6" opacity="0.5"/>
    </pattern>`;
  svg.appendChild(defs);

  // Container group (kept for future tweaks; no mask currently — the
  // gradient wash + closed-above-bottom fills already give a soft shore).
  const masked = document.createElementNS(SVG_NS, "g");
  svg.appendChild(masked);

  const bg = document.createElementNS(SVG_NS, "rect");
  bg.setAttribute("width", String(W));
  bg.setAttribute("height", String(H));
  bg.setAttribute("fill", "url(#wave-wash)");
  masked.appendChild(bg);

  // Layer paths
  const elements = layers.map((layer) => {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("fill", layer.fill ? layer.fill : "none");
    if (!layer.fill) {
      p.setAttribute("stroke", layer.stroke);
      p.setAttribute("stroke-width", String(layer.strokeWidth));
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
    }
    if (layer.opacity != null) p.setAttribute("opacity", String(layer.opacity));
    masked.appendChild(p);

    // If this is a hatched fill layer, also append a hatch-tinted overlay
    if (layer.hatch) {
      const hatch = document.createElementNS(SVG_NS, "path");
      hatch.setAttribute("fill", "url(#wave-hatch)");
      hatch.setAttribute("opacity", "0.55");
      hatch.dataset.hatchFor = "true";
      masked.appendChild(hatch);
      return { layer, el: p, hatch };
    }
    return { layer, el: p };
  });

  // The snark: a coral lifebuoy that rides on the foreground wave crest.
  const lifebuoyGroup = document.createElementNS(SVG_NS, "g");
  const buoyX = rand(W * 0.30, W * 0.70);
  lifebuoyGroup.innerHTML = `
    <circle r="6" fill="#F43F5E"/>
    <circle r="13" fill="none" stroke="#F43F5E" stroke-width="1.2" opacity="0.55"/>`;
  masked.appendChild(lifebuoyGroup);

  // Tiny far-side lighthouse pinpoint
  const lighthouse = document.createElementNS(SVG_NS, "g");
  const lhX = rand(60, 200);
  lighthouse.innerHTML = `
    <line x1="0" y1="0" x2="0" y2="14" stroke="#0A1F4D" stroke-width="0.9" opacity="0.7"/>
    <circle cx="0" cy="-2" r="2.2" fill="#F43F5E" opacity="0.85"/>`;
  lighthouse.setAttribute("transform", `translate(${lhX} 100)`);
  masked.appendChild(lighthouse);

  host.replaceChildren(svg);

  // ----- Animate --------------------------------------------------------
  const DUR = 500; // ms
  // Quadratic ease-out: ∫(v0 (1 - t/dur)) dt = v0 t - v0 t²/(2 dur).
  // We want eased "wall-clock-equivalent" time so phaseSpeed * t reads naturally.
  // Scale so the integrated time over [0, DUR] equals SETTLE_SECONDS.
  const SETTLE_SECONDS = 1.6;
  const easedTime = (tMs) => {
    const x = Math.min(tMs, DUR) / DUR;
    // ∫(1 - x) dx from 0..u = u - u²/2 ; max at u=1 is 0.5
    const integ = x - 0.5 * x * x;
    return integ * 2 * SETTLE_SECONDS; // 0..SETTLE_SECONDS over 0..DUR
  };

  const start = performance.now();
  function frame(now) {
    const elapsed = now - start;
    const t = easedTime(elapsed);
    for (const { layer, el, hatch } of elements) {
      const d = pathD(layer, t);
      el.setAttribute("d", d);
      if (hatch) hatch.setAttribute("d", d);
    }
    // Drive the lifebuoy: ride the foreground wave at fixed x
    const foreground = layers[7]; // the foreground fill layer
    let buoyY = foreground.baseY;
    for (const h of foreground.harmonics) {
      buoyY += h.amp * Math.sin(h.freq * buoyX + h.phase + h.phaseSpeed * t);
    }
    lifebuoyGroup.setAttribute("transform", `translate(${buoyX} ${buoyY - 6})`);

    if (elapsed < DUR) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
