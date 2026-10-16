import { useState } from 'react';
import type { JSX } from 'react';
import { SILK_PALETTE } from '../../engine/config/people';
import {
  MAX_SILKS_LAYERS, SILKS_BODY_PATTERNS, SILKS_CAP_PATTERNS, SILKS_SLEEVE_PATTERNS,
} from '../../engine/people/silks';
import type { SilksDesign, SilksPart } from '../../engine/types';
import SilksSvg from './SilksSvg';
import { BODY_PATTERN_KO, CAP_PATTERN_KO, SLEEVE_PATTERN_KO } from './silksText';
import './silks.css';

type PartName = keyof SilksDesign;
const PARTS: { key: PartName; label: string; patterns: readonly string[]; labels: Readonly<Record<string, string>> }[] = [
  { key: 'body', label: '몸통', patterns: SILKS_BODY_PATTERNS, labels: BODY_PATTERN_KO },
  { key: 'sleeves', label: '소매', patterns: SILKS_SLEEVE_PATTERNS, labels: SLEEVE_PATTERN_KO },
  { key: 'cap', label: '모자', patterns: SILKS_CAP_PATTERNS, labels: CAP_PATTERN_KO },
];
const COLOUR_RE = /^#[0-9a-f]{6}$/;

function ColourPicker({ label, value, onChange }: { label: string; value: string; onChange: (colour: string) => void }): JSX.Element {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const invalid = editing && !COLOUR_RE.test(draft);
  return <div className="silks-colour">
    <label>{label} <input type="color" value={value} onChange={(e) => {
      setEditing(false);
      onChange(e.target.value.toLowerCase());
    }} /></label>
    <label>직접 입력 <input type="text" value={editing ? draft : value} maxLength={7}
      aria-invalid={invalid} placeholder="#rrggbb" onChange={(e) => {
        const colour = e.target.value.toLowerCase();
        setDraft(colour);
        setEditing(true);
        if (COLOUR_RE.test(colour)) onChange(colour);
      }} onBlur={() => { setEditing(false); setDraft(value); }} /></label>
    {invalid && <span role="status">#과 여섯 자리 색상 코드를 입력하세요.</span>}
    <div className="silks-palette" aria-label={`${label} 팔레트`}>
      {SILK_PALETTE.map((colour) => <button key={colour} type="button" title={colour}
        aria-label={`${label} ${colour}`} aria-pressed={value === colour}
        style={{ backgroundColor: colour }} onClick={() => { setEditing(false); onChange(colour); }} />)}
    </div>
  </div>;
}

function pick<T,>(items: readonly T[]): T { return items[Math.floor(Math.random() * items.length)]!; }
/** 시드 없는 무작위는 편집기 안에서만 사용한다. */
function randomDesign(): SilksDesign {
  const part = <P extends string,>(patterns: readonly P[]): SilksPart<P> => ({
    base: pick(SILK_PALETTE),
    layers: Array.from({ length: Math.floor(Math.random() * (MAX_SILKS_LAYERS + 1)) }, () => ({
      pattern: pick(patterns), colour: pick(SILK_PALETTE),
    })),
  });
  return { body: part(SILKS_BODY_PATTERNS), sleeves: part(SILKS_SLEEVE_PATTERNS), cap: part(SILKS_CAP_PATTERNS) };
}

export interface SilksEditorProps { design: SilksDesign; onChange: (design: SilksDesign) => void }
export default function SilksEditor({ design, onChange }: SilksEditorProps): JSX.Element {
  const [selected, setSelected] = useState<PartName>('body');
  const config = PARTS.find((part) => part.key === selected)!;
  const part = design[selected];
  // selected 와 해당 목록에서만 무늬를 고르므로 부분별 유니언이 보존된다.
  const update = (next: SilksPart<string>): void => onChange({ ...design, [selected]: next } as SilksDesign);
  return <fieldset className="silks-editor">
    <legend>승부복</legend>
    <div className="silks-editor__layout">
      <div className="silks-editor__preview"><SilksSvg design={design} size={200} />
        <button type="button" className="btn" onClick={() => onChange(randomDesign())}>무작위</button>
      </div>
      <div>
        <div className="silks-editor__tabs" aria-label="편집할 부분">
          {PARTS.map(({ key, label }) => <button key={key} type="button" className="btn"
            aria-pressed={selected === key} onClick={() => setSelected(key)}>{label}</button>)}
        </div>
        <div key={selected}>
          <ColourPicker label={`${config.label} 바탕색`} value={part.base} onChange={(base) => update({ ...part, base })} />
          {part.layers.map((layer, index) => <fieldset key={index} className="silks-editor__layer">
            <legend>층 {index + 1}</legend>
            <label>무늬 <select value={layer.pattern} onChange={(e) => update({ ...part,
              layers: part.layers.map((old, i) => i === index ? { ...old, pattern: e.target.value } : old),
            })}>
              {config.patterns.map((pattern) => <option key={pattern} value={pattern}>{config.labels[pattern]}</option>)}
            </select></label>
            <ColourPicker label={`층 ${index + 1} 색`} value={layer.colour} onChange={(colour) => update({ ...part,
              layers: part.layers.map((old, i) => i === index ? { ...old, colour } : old),
            })} />
            <button type="button" className="btn" onClick={() => update({ ...part,
              layers: part.layers.filter((_, i) => i !== index),
            })}>층 {index + 1} 삭제</button>
          </fieldset>)}
          <button type="button" className="btn" disabled={part.layers.length >= MAX_SILKS_LAYERS}
            onClick={() => update({ ...part, layers: [...part.layers, { pattern: config.patterns[1]!, colour: SILK_PALETTE.find((colour) => colour !== part.base)! }] })}>
            층 추가 ({part.layers.length}/{MAX_SILKS_LAYERS})
          </button>
        </div>
      </div>
    </div>
  </fieldset>;
}
