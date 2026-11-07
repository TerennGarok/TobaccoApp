// Single-series line chart with the target range shaded behind it.
// One measure per chart (humidity and temperature are never put on a shared
// dual axis). Tap/drag across the plot to read a value.
import { useState } from 'react';
import { type GestureResponderEvent, type LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { colors, space, type } from '../theme';

export interface Point {
  t: number; // epoch ms
  v: number;
}

export function RangeChart({
  title,
  unit,
  points,
  min,
  max,
  color,
  height = 140,
}: {
  title: string;
  unit: string;
  points: Point[];
  min: number;
  max: number;
  color: string;
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<Point | null>(null);
  const pad = { l: 34, r: 8, t: 8, b: 18 };

  const values = points.map((p) => p.v);
  const lo = Math.floor(Math.min(min, ...values) - 1);
  const hi = Math.ceil(Math.max(max, ...values) + 1);
  const t0 = points[0]?.t ?? 0;
  const t1 = points[points.length - 1]?.t ?? 1;
  const w = Math.max(0, width - pad.l - pad.r);
  const h = height - pad.t - pad.b;
  const x = (t: number) => pad.l + (t1 === t0 ? w : ((t - t0) / (t1 - t0)) * w);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * h;

  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');

  const pick = (e: GestureResponderEvent) => {
    if (!points.length) return;
    const px = e.nativeEvent.locationX;
    let best = points[0];
    for (const p of points) if (Math.abs(x(p.t) - px) < Math.abs(x(best.t) - px)) best = p;
    setHover(best);
  };

  const shown = hover ?? points[points.length - 1];

  return (
    <View style={{ marginBottom: space.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.sm }}>
        <Text style={type.label}>{title}</Text>
        {shown ? (
          <Text style={type.caption}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>
              {shown.v.toFixed(1)}
              {unit}
            </Text>{' '}
            {new Date(shown.t).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
          </Text>
        ) : null}
      </View>
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderRelease={() => setHover(null)}
        accessibilityLabel={`${title} chart, target ${min} to ${max}${unit}`}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            {/* target band */}
            <Rect x={pad.l} y={y(max)} width={w} height={Math.max(0, y(min) - y(max))} fill={colors.brass} opacity={0.12} />
            <Line x1={pad.l} x2={pad.l + w} y1={y(max)} y2={y(max)} stroke={colors.brassDim} strokeWidth={1} strokeDasharray="3 4" />
            <Line x1={pad.l} x2={pad.l + w} y1={y(min)} y2={y(min)} stroke={colors.brassDim} strokeWidth={1} strokeDasharray="3 4" />
            {points.length > 1 ? <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
            {hover ? (
              <>
                <Line x1={x(hover.t)} x2={x(hover.t)} y1={pad.t} y2={pad.t + h} stroke={colors.textFaint} strokeWidth={1} />
                <Circle cx={x(hover.t)} cy={y(hover.v)} r={5} fill={color} stroke={colors.surface} strokeWidth={2} />
              </>
            ) : null}
          </Svg>
        ) : (
          <View style={{ height }} />
        )}
        {width > 0 ? (
          <>
            {[max, min].map((v) => (
              <Text key={v} style={{ position: 'absolute', left: 0, top: y(v) - 8, width: pad.l - 6, textAlign: 'right', fontSize: 11, color: colors.textFaint }}>
                {v}
              </Text>
            ))}
          </>
        ) : null}
      </View>
    </View>
  );
}
