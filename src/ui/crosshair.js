// Renders a CS-style crosshair into a DOM element from settings.crosshair.
export function renderCrosshair(el, c) {
  const size = +c.size, th = +c.thick, gap = +c.gap, color = c.color, alpha = +c.alpha;
  const outline = c.outline ? `0 0 0 1px rgba(0,0,0,0.85)` : 'none';
  const base = `position:absolute;background:${color};box-shadow:${outline};`;
  const parts = [];
  // Lines are offset by the dynamic spread gap (--spread) through CSS transforms.
  const line = (x, y, w, h, dir) =>
    parts.push(`<i class="xh-${dir}" style="${base}left:${x}px;top:${y}px;width:${w}px;height:${h}px"></i>`);
  const dot = (r) =>
    parts.push(`<i style="${base}left:${-r}px;top:${-r}px;width:${r * 2}px;height:${r * 2}px;border-radius:50%"></i>`);

  const has = { cross: c.style === 'cross' || c.style === 'crossdot' || c.style === 'tee', dot: c.style === 'dot' || c.style === 'crossdot' };

  if (has.cross) {
    if (c.style !== 'tee') line(-th / 2, -(gap + size), th, size, 'up'); // top
    line(-th / 2, gap, th, size, 'down'); // bottom
    line(-(gap + size), -th / 2, size, th, 'left'); // left
    line(gap, -th / 2, size, th, 'right'); // right
  }
  if (has.dot) dot(Math.max(1, th / 2 + 0.5));
  if (c.style === 'circle') {
    const r = size + gap;
    parts.push(`<i style="position:absolute;left:${-r}px;top:${-r}px;width:${r * 2}px;height:${r * 2}px;border-radius:50%;border:${th}px solid ${color};box-shadow:${outline}, inset ${outline}"></i>`);
    dot(Math.max(1, th / 2));
  }
  el.style.opacity = String(alpha);
  el.innerHTML = parts.join('');
}
