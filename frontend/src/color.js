function rgb2hsv(r, g, b) {
  const v = Math.max(r, g, b),
    c = v - Math.min(r, g, b);
  const h =
    c && (v == r ? (g - b) / c : v == g ? 2 + (b - r) / c : 4 + (r - g) / c);
  return [60 * (h < 0 ? h + 6 : h), v && c / v, v];
}

function hsv2rgb(
  h,
  s,
  v
) {
  const f = (n, k = (n + h / 60) % 6) =>
    v - v * s * Math.max(Math.min(k, 4 - k, 1), 0)
  return [f(5), f(3), f(1)];
}

export function inverseLerp(a, b, v) {
  return (v - a) / (b - a);
}

export function lerp(a, b, t) {
  return t * b - (t - 1) * a;
}

export function lerpColor(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function lerpColorHSV(a, b, t) {
  const aHSV = rgb2hsv(a[0], a[1], a[2]);
  const bHSV = rgb2hsv(b[0], b[1], b[2]);

  const s = lerp(aHSV[1], bHSV[1], t);
  const v = lerp(aHSV[2], bHSV[2], t);

  let h;
  let d = bHSV[0] - aHSV[0];
  if (aHSV[0] > bHSV[0]) {
    // Swap
    const tempH = bHSV[0];
    bHSV[0] = aHSV[0];
    aHSV[0] = tempH;

    d *= -1;
    t = 1 - t;
  }

  if (d > 180) {
    aHSV[0] = aHSV[0] + 360;
    h = (aHSV[0] + t * (bHSV[0] - aHSV[0])) % 360;
  }
  if (d <= 180) {
    h = aHSV[0] + t * d;
  }

  const lerpedHSV = [h, s, v];
  const lerpedHSV2RBG = hsv2rgb(lerpedHSV[0], lerpedHSV[1], lerpedHSV[2]);
  return lerpedHSV2RBG;
}
