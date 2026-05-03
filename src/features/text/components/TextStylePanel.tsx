import { RetryIcon } from "@/components/icons/ui-icons";
import type { TextAssetContent, TextAssetItem } from "@/domain/assets/types";
import { useSystemFonts } from "@/features/text/hooks/use-system-fonts";

const TEXT_FILL_SWATCHES = ["#eef1f5", "#111820", "#ffdf6e", "#7dd6c8", "#ff877c", "#9fb3ff"];

interface TextStylePanelProps {
  asset: TextAssetItem;
  onUpdate: (update: Partial<TextAssetContent>) => void;
}

export function TextStylePanel({
  asset,
  onUpdate,
}: TextStylePanelProps) {
  const text = asset.text;
  const { fontFamilies, loadSystemFonts, status } = useSystemFonts(text.fontFamily);
  const isBold = text.fontStyle.includes("bold");
  const isItalic = text.fontStyle.includes("italic");
  const setFontStyle = (next: { bold?: boolean; italic?: boolean }) => {
    const bold = next.bold ?? isBold;
    const italic = next.italic ?? isItalic;

    onUpdate({
      fontStyle: bold && italic ? "bold italic" : bold ? "bold" : italic ? "italic" : "normal",
    });
  };

  return (
    <div
      className="text-style-panel"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <label className="text-style-panel__field text-style-panel__field--span">
        <span>Text</span>
        <textarea
          rows={3}
          spellCheck={false}
          value={text.value}
          onChange={(event) => onUpdate({ value: event.currentTarget.value })}
        />
      </label>

      <label className="text-style-panel__field text-style-panel__field--font">
        <span>Font</span>
        <select
          value={text.fontFamily}
          onChange={(event) => onUpdate({ fontFamily: event.currentTarget.value })}
        >
          {fontFamilies.map((fontFamily) => (
            <option key={fontFamily} value={fontFamily}>
              {fontFamily}
            </option>
          ))}
        </select>
      </label>

      <button
        className="text-style-panel__icon-button"
        disabled={status === "loading"}
        title={status === "ready" ? "Refresh system fonts" : "Load system fonts"}
        onClick={() => void loadSystemFonts()}
      >
        <RetryIcon size={14} />
        <span className="sr-only">Refresh fonts</span>
      </button>

      <label className="text-style-panel__field text-style-panel__field--number">
        <span>Size</span>
        <input
          min={6}
          max={240}
          step={1}
          type="number"
          value={Math.round(text.fontSize)}
          onChange={(event) => onUpdate({ fontSize: Number.parseInt(event.currentTarget.value, 10) || 6 })}
        />
      </label>

      <div className="text-style-panel__toggle-group" aria-label="Text style">
        <button
          className={`text-style-panel__toggle ${isBold ? "text-style-panel__toggle--active" : ""}`}
          title="Bold"
          onClick={() => setFontStyle({ bold: !isBold })}
        >
          <strong>B</strong>
        </button>
        <button
          className={`text-style-panel__toggle ${isItalic ? "text-style-panel__toggle--active" : ""}`}
          title="Italic"
          onClick={() => setFontStyle({ italic: !isItalic })}
        >
          <em>I</em>
        </button>
      </div>

      <div className="text-style-panel__toggle-group" aria-label="Text align">
        {(["left", "center", "right"] as const).map((align) => (
          <button
            key={align}
            className={`text-style-panel__toggle ${text.align === align ? "text-style-panel__toggle--active" : ""}`}
            title={`Align ${align}`}
            onClick={() => onUpdate({ align })}
          >
            <span>{align[0].toUpperCase()}</span>
          </button>
        ))}
      </div>

      <div className="text-style-panel__swatches" aria-label="Text color">
        {TEXT_FILL_SWATCHES.map((fill) => (
          <button
            key={fill}
            className={`text-style-panel__swatch ${text.fill.toLowerCase() === fill ? "text-style-panel__swatch--active" : ""}`}
            style={{ backgroundColor: fill }}
            title={fill}
            onClick={() => onUpdate({ fill })}
          >
            <span className="sr-only">{fill}</span>
          </button>
        ))}
        <input
          aria-label="Text color"
          className="text-style-panel__color-input"
          type="color"
          value={text.fill}
          onChange={(event) => onUpdate({ fill: event.currentTarget.value })}
        />
      </div>

    </div>
  );
}
