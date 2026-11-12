import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import { cn } from '@/lib/utils';
import { formatFileSize, uploadVariantConfig } from '@/lib/form-uploads';
import {
  fileAcceptForField,
  normalizeFieldOptions,
  type PublicFormField,
} from '@/lib/public-form';

interface FieldInputProps {
  field: PublicFormField;
  value: unknown;
  error?: string;
  disabled?: boolean;
  onChange: (fieldId: string, value: unknown) => void;
  /**
   * Whole-form custom style (GHL upgrade): the form's text colour for
   * labels/legends (their classes fix the colour, so it is passed as
   * an inline style) and the form's primary colour as the radio /
   * checkbox accent. Both optional — absent = the default dark + gold.
   */
  textColor?: string;
  accentColor?: string;
}

/**
 * One schema field, rendered with the shared dark/gold controls.
 * Presentational only (no state, no fetch) so it can be unit-tested
 * with renderToStaticMarkup. Labels carry the required marker; errors
 * render inline under the control.
 */
export function PublicFormFieldInput({ field, value, error, disabled, onChange, textColor, accentColor }: FieldInputProps) {
  const label = `${field.label}${field.required ? ' *' : ''}`;
  const stringValue = typeof value === 'string' ? value : '';
  // Inline styles beat the label/accent classes (see FieldInputProps).
  const labelStyle = textColor ? { color: textColor } : undefined;
  const accentStyle = accentColor ? { accentColor } : undefined;

  switch (field.type) {
    case 'file': {
      const config = uploadVariantConfig(field.uploadVariant);
      const chosen =
        typeof File !== 'undefined' && value instanceof File ? value : null;
      return (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground/80">
            {label}
          </label>
          <input
            type="file"
            accept={fileAcceptForField(field)}
            disabled={disabled}
            onChange={(e) => onChange(field.id, e.target.files?.[0] ?? null)}
            className="w-full bg-dark-card border border-dark-border rounded-lg px-4 py-2.5 text-sm text-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-ink file:text-xs file:font-semibold file:cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
          <p className="text-xs text-muted">
            {chosen ? `${chosen.name} (${formatFileSize(chosen.size)})` : config.description}
          </p>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      );
    }
    case 'textarea':
      return (
        <Textarea
          label={label}
          labelStyle={labelStyle}
          placeholder={field.placeholder}
          value={stringValue}
          error={error}
          disabled={disabled}
          onChange={(e) => onChange(field.id, e.target.value)}
        />
      );
    case 'select': {
      const options = [
        { value: '', label: field.placeholder ?? 'Select an option' },
        ...normalizeFieldOptions(field),
      ];
      return (
        <Select
          label={label}
          labelStyle={labelStyle}
          options={options}
          value={stringValue}
          error={error}
          disabled={disabled}
          onChange={(e) => onChange(field.id, e.target.value)}
        />
      );
    }
    case 'radio': {
      const options = normalizeFieldOptions(field);
      return (
        <fieldset disabled={disabled} className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium text-foreground/80" style={labelStyle}>{label}</legend>
          <div className="flex flex-col gap-2 pt-1">
            {options.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer" style={labelStyle}>
                <input
                  type="radio"
                  name={field.id}
                  value={opt.value}
                  checked={stringValue === opt.value}
                  onChange={() => onChange(field.id, opt.value)}
                  className="w-4 h-4 accent-primary"
                  style={accentStyle}
                />
                {opt.label}
              </label>
            ))}
            {options.length === 0 && (
              <p className="text-xs text-muted">No options configured for this question.</p>
            )}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </fieldset>
      );
    }
    case 'checkbox': {
      const options = normalizeFieldOptions(field);
      if (options.length > 0) {
        // Multi-checkbox: the value is the array of chosen option values.
        const chosen = Array.isArray(value) ? (value as unknown[]) : [];
        const toggle = (optValue: string) => {
          const next = chosen.includes(optValue)
            ? chosen.filter((v) => v !== optValue)
            : [...chosen, optValue];
          onChange(field.id, next);
        };
        return (
          <fieldset disabled={disabled} className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium text-foreground/80" style={labelStyle}>{label}</legend>
            <div className="flex flex-col gap-2 pt-1">
              {options.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer" style={labelStyle}>
                  <input
                    type="checkbox"
                    name={field.id}
                    value={opt.value}
                    checked={chosen.includes(opt.value)}
                    onChange={() => toggle(opt.value)}
                    className="w-4 h-4 accent-primary"
                    style={accentStyle}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </fieldset>
        );
      }
      return (
        <div className="flex flex-col gap-1.5">
          <label className="flex items-start gap-2.5 text-sm text-foreground cursor-pointer pt-1" style={labelStyle}>
            <input
              type="checkbox"
              id={field.id}
              name={field.id}
              checked={value === true}
              disabled={disabled}
              onChange={(e) => onChange(field.id, e.target.checked)}
              className="w-4 h-4 mt-0.5 accent-primary"
              style={accentStyle}
            />
            <span>
              {field.label}
              {field.required && <span className="text-primary-text"> *</span>}
            </span>
          </label>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      );
    }
    case 'number':
      return (
        <Input
          type="number"
          label={label}
          labelStyle={labelStyle}
          placeholder={field.placeholder}
          value={stringValue}
          error={error}
          disabled={disabled}
          min={field.validation?.min}
          max={field.validation?.max}
          onChange={(e) => onChange(field.id, e.target.value)}
        />
      );
    case 'date':
      return (
        <Input
          type="date"
          label={label}
          labelStyle={labelStyle}
          value={stringValue}
          error={error}
          disabled={disabled}
          onChange={(e) => onChange(field.id, e.target.value)}
        />
      );
    case 'email':
    case 'tel':
    case 'password':
    case 'text':
    default:
      return (
        <Input
          type={field.type === 'text' ? 'text' : field.type}
          label={label}
          labelStyle={labelStyle}
          placeholder={field.placeholder}
          value={stringValue}
          error={error}
          disabled={disabled}
          onChange={(e) => onChange(field.id, e.target.value)}
        />
      );
  }
}

interface FieldsProps {
  fields: PublicFormField[];
  values: Record<string, unknown>;
  errors: Record<string, string>;
  disabled?: boolean;
  onChange: (fieldId: string, value: unknown) => void;
  /** Whole-form custom style — see FieldInputProps. */
  textColor?: string;
  accentColor?: string;
}

/**
 * All fields in schema order. Consecutive half-width fields sit
 * side-by-side (two-column row on sm+ screens); anything else takes the
 * full row. A lone half-width field at the end of the list also takes
 * the full row rather than leaving a gap.
 */
export function PublicFormFields({ fields, values, errors, disabled, onChange, textColor, accentColor }: FieldsProps) {
  const rows: PublicFormField[][] = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const next = fields[i + 1];
    if (
      field.styling?.width === 'half' &&
      next?.styling?.width === 'half'
    ) {
      rows.push([field, next]);
      i++;
    } else {
      rows.push([field]);
    }
  }

  return (
    <div className="space-y-4">
      {rows.map((row, rowIdx) => (
        <div
          key={row.map((f) => f.id).join('+') || `row-${rowIdx}`}
          className={cn(row.length > 1 && 'grid sm:grid-cols-2 gap-4')}
        >
          {row.map((field) => (
            <PublicFormFieldInput
              key={field.id}
              field={field}
              value={values[field.id]}
              error={errors[field.id]}
              disabled={disabled}
              onChange={onChange}
              textColor={textColor}
              accentColor={accentColor}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
