import { COLORS } from "./constants";

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {COLORS.map(c => (
        <button key={c} type="button" onClick={() => onChange(c)}
          style={{
            width: 22, height: 22, borderRadius: "50%", background: c,
            border: value === c ? "2px solid var(--c-text-primary)" : "2px solid transparent",
            cursor: "pointer", padding: 0,
          }}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: 26, height: 26, border: "1px solid var(--c-border)", borderRadius: 4, background: "var(--c-bg-surface)", cursor: "pointer", padding: 1 }}
      />
    </div>
  );
}
