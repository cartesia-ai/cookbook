import { Field } from "@/components/blocks/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LANGUAGES, isLanguageCode, type LanguageCode } from "@/lib/languages";

const ITEMS = LANGUAGES.map((l) => ({ value: l.code, label: l.name === l.nativeName ? l.name : `${l.name} (${l.nativeName})` }));

export function LanguageSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: LanguageCode;
  onChange: (code: LanguageCode) => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <Select value={value} onValueChange={(v) => isLanguageCode(v) && onChange(v)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ITEMS.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
