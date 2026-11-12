'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Save, Eye, EyeOff, Trash2, Copy, ChevronUp, ChevronDown,
  GripVertical, ListChecks, MousePointerClick, Plus, X,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import {
  FORM_PALETTE,
  formStatusLabel,
  formTypeLabel,
  OPTION_FIELD_TYPES,
  TEXT_FIELD_TYPES,
  findPaletteItem,
  paletteItemToField,
  reorderFields,
  validateSchema,
  type AdminFormDetail,
  type FormField,
  type FormSchema,
  type FormStatus,
} from '@/lib/forms';
import toast from 'react-hot-toast';

type DragPayload =
  | { kind: 'palette'; key: string }
  | { kind: 'field'; index: number };

const DRAG_MIME = 'application/x-codebettle-form-drag';

/** Read the drag payload back; returns null for drags from outside the builder. */
function readDragPayload(e: React.DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DragPayload;
    if (parsed.kind === 'palette' && typeof parsed.key === 'string') return parsed;
    if (parsed.kind === 'field' && typeof parsed.index === 'number') return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * Live preview of one field, rendered as the end user will see it on
 * the public form. Inputs are uncontrolled so typing in the preview
 * works locally; nothing typed here touches builder state.
 */
function FieldPreview({ field }: { field: FormField }) {
  const width = field.styling?.width === 'half' ? 'sm:w-[calc(50%-0.375rem)] w-full' : 'w-full';
  const inputClass =
    'w-full bg-dark-card border border-dark-border rounded-lg px-4 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary';
  const label = (
    <span className="text-sm font-medium text-white/80 block mb-1.5">
      {field.label}
      {field.required && <span className="text-red-400 ml-0.5">*</span>}
    </span>
  );

  return (
    <div className={width}>
      {label}
      {field.type === 'textarea' ? (
        <textarea rows={3} placeholder={field.placeholder} defaultValue="" className={cn(inputClass, 'resize-none')} />
      ) : field.type === 'select' ? (
        <select defaultValue="" className={cn(inputClass, 'cursor-pointer')}>
          <option value="" disabled>
            {field.placeholder ?? 'Select an option'}
          </option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o} className="bg-dark-card">{o}</option>
          ))}
        </select>
      ) : field.type === 'radio' ? (
        <div className="space-y-2 pt-1">
          {(field.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm text-white/90 cursor-pointer">
              <input type="radio" name={`preview-${field.id}`} value={o} className="w-4 h-4 accent-primary" />
              {o}
            </label>
          ))}
        </div>
      ) : field.type === 'checkbox' ? (
        <div className="space-y-2 pt-1">
          {(field.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm text-white/90 cursor-pointer">
              <input type="checkbox" value={o} className="w-4 h-4 accent-primary" />
              {o}
            </label>
          ))}
        </div>
      ) : (
        <input
          type={field.type}
          placeholder={field.placeholder}
          defaultValue=""
          min={field.validation?.min}
          max={field.validation?.max}
          minLength={field.validation?.minLength}
          maxLength={field.validation?.maxLength}
          className={inputClass}
        />
      )}
    </div>
  );
}

/**
 * 3-pane form builder (Phase 6, Worker B).
 * LEFT: field palette grouped by category (drag or click to add).
 * CENTRE: canvas — HTML5 drag-and-drop to add/reorder, click to select,
 * live preview of each field as the end user will see it.
 * RIGHT: editor for the selected field + form-level settings.
 * Edits live in client state until Save (PATCH /api/admin/forms/[id]);
 * invalid schemas are blocked from saving with a clear message.
 */
export default function BuilderClient({ formId }: { formId: string }) {
  const router = useRouter();
  const [form, setForm] = useState<AdminFormDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<FormStatus>('draft');
  const [fields, setFields] = useState<FormField[]>([]);
  const [submitButtonText, setSubmitButtonText] = useState('Submit');
  const [successMessage, setSuccessMessage] = useState('Thank you! Your response has been recorded.');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const loadForm = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/forms/${formId}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(body.error ?? 'Could not load this form');
        return;
      }
      const loaded = body.form as AdminFormDetail;
      setForm(loaded);
      setName(loaded.name);
      setDescription(loaded.description ?? '');
      setStatus(loaded.status);
      const schema: FormSchema = loaded.schema ?? { fields: [] };
      setFields(schema.fields ?? []);
      setSubmitButtonText(schema.submitButtonText ?? 'Submit');
      setSuccessMessage(schema.successMessage ?? 'Thank you! Your response has been recorded.');
      setSelectedId(null);
      setDirty(false);
      setValidationErrors([]);
    } catch {
      setLoadError('Could not load this form — check your connection and try again');
    } finally {
      setLoading(false);
    }
  }, [formId]);

  // Deferred to a microtask: the loader sets state synchronously at
  // its start, and calling it directly in the effect body trips the
  // react-hooks/set-state-in-effect rule. Same loader as Refresh.
  useEffect(() => {
    void Promise.resolve().then(() => loadForm());
  }, [loadForm]);

  const selectedField = useMemo(
    () => fields.find((f) => f.id === selectedId) ?? null,
    [fields, selectedId],
  );

  const markDirty = () => setDirty(true);

  const updateField = (id: string, patch: Partial<FormField>) => {
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    markDirty();
  };

  const updateValidation = (id: string, patch: Partial<NonNullable<FormField['validation']>>) => {
    setFields((fs) =>
      fs.map((f) =>
        f.id === id ? { ...f, validation: { ...(f.validation ?? {}), ...patch } } : f,
      ),
    );
    markDirty();
  };

  /** Add a palette item to the canvas (at `atIndex`, or appended). */
  const addFieldFromPalette = (key: string, atIndex?: number) => {
    const item = findPaletteItem(key);
    if (!item) return;
    const field = paletteItemToField(item, fields.map((f) => f.id));
    setFields((fs) => {
      const next = [...fs];
      const at = atIndex === undefined ? next.length : Math.max(0, Math.min(atIndex, next.length));
      next.splice(at, 0, field);
      return next;
    });
    setSelectedId(field.id);
    markDirty();
  };

  const handleDrop = (e: React.DragEvent, atIndex: number) => {
    e.preventDefault();
    const payload = readDragPayload(e);
    setDragIndex(null);
    setDropIndex(null);
    if (!payload) return;
    if (payload.kind === 'palette') {
      addFieldFromPalette(payload.key, atIndex);
    } else if (payload.kind === 'field') {
      // Dropping on field i inserts before it; dragging down past the
      // source needs the target shifted by one (the source leaves first).
      const target = payload.index < atIndex ? atIndex - 1 : atIndex;
      setFields((fs) => reorderFields(fs, payload.index, target));
      markDirty();
    }
  };

  const moveField = (index: number, direction: -1 | 1) => {
    setFields((fs) => reorderFields(fs, index, index + direction));
    markDirty();
  };

  const duplicateField = (index: number) => {
    const source = fields[index];
    if (!source) return;
    const copy: FormField = {
      ...source,
      id: `${source.id}-copy`,
      label: `${source.label} (copy)`,
      options: source.options ? [...source.options] : undefined,
      validation: source.validation ? { ...source.validation } : undefined,
      styling: source.styling ? { ...source.styling } : undefined,
    };
    // Guarantee a unique id even if a copy already exists.
    const taken = new Set(fields.map((f) => f.id));
    let n = 2;
    while (taken.has(copy.id)) {
      copy.id = `${source.id}-copy-${n}`;
      n += 1;
    }
    setFields((fs) => {
      const next = [...fs];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setSelectedId(copy.id);
    markDirty();
  };

  const deleteField = (id: string) => {
    setFields((fs) => fs.filter((f) => f.id !== id));
    if (selectedId === id) setSelectedId(null);
    markDirty();
  };

  const saveForm = async () => {
    if (!name.trim()) {
      toast.error('Form title required');
      return;
    }
    const schema: FormSchema = {
      fields,
      submitButtonText: submitButtonText.trim() || 'Submit',
      successMessage: successMessage.trim(),
    };
    const errors = validateSchema(schema);
    setValidationErrors(errors);
    if (errors.length > 0) {
      toast.error('Fix the schema problems below before saving');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/forms/${formId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), schema }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? 'Could not save the form');
        return;
      }
      const saved = body.form as AdminFormDetail;
      setForm(saved);
      setStatus(saved.status);
      setDirty(false);
      toast.success('Form saved');
      router.refresh();
    } catch {
      toast.error('Could not save the form — check your connection and try again');
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async () => {
    const nextStatus: FormStatus = status === 'published' ? 'draft' : 'published';
    setToggling(true);
    try {
      const res = await fetch(`/api/admin/forms/${formId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? 'Could not update the form');
        return;
      }
      const saved = body.form as AdminFormDetail;
      setStatus(saved.status);
      setForm(saved);
      toast.success(saved.status === 'published' ? 'Form published' : 'Form moved to drafts');
      router.refresh();
    } catch {
      toast.error('Could not update the form — check your connection and try again');
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <Card className="py-16 text-center">
        <Spinner className="mx-auto" />
        <p className="text-muted text-sm mt-3">Loading form…</p>
      </Card>
    );
  }

  if (loadError || !form) {
    return (
      <Card className="py-16 text-center">
        <p className="text-white font-medium">Couldn&apos;t load this form</p>
        <p className="text-muted text-sm mt-1">{loadError ?? 'Form not found'}</p>
        <div className="mt-4 flex justify-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => void loadForm()}>Try again</Button>
          <Button variant="secondary" size="sm" onClick={() => router.push('/admin/forms')}>Back to forms</Button>
        </div>
      </Card>
    );
  }

  const validation = selectedField?.validation ?? {};

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/admin/forms" className="text-muted hover:text-white p-1 shrink-0" title="Back to forms">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-black text-white truncate">{name || 'Untitled form'}</h1>
            <p className="text-muted text-xs mt-0.5">
              {formTypeLabel(form.type)} · /{form.slug} · {fields.length} field{fields.length !== 1 ? 's' : ''}
              {dirty && <span className="text-yellow-400 font-medium"> · Unsaved changes</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={status === 'published' ? 'success' : 'muted'}>{formStatusLabel(status)}</Badge>
          <Button variant="secondary" size="sm" onClick={() => router.push(`/admin/forms/${formId}/submissions`)}>
            <ListChecks className="w-4 h-4" />Submissions
          </Button>
          <Button variant="outline" size="sm" onClick={() => void togglePublish()} loading={toggling} disabled={toggling}>
            {status === 'published' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {status === 'published' ? 'Unpublish' : 'Publish'}
          </Button>
          <Button size="sm" onClick={() => void saveForm()} loading={saving} disabled={saving}>
            <Save className="w-4 h-4" />Save form
          </Button>
        </div>
      </div>

      {validationErrors.length > 0 && (
        <Card className="border-red-500/40">
          <p className="text-red-400 text-sm font-semibold mb-2">Fix these before saving:</p>
          <ul className="list-disc pl-5 space-y-1">
            {validationErrors.map((err) => (
              <li key={err} className="text-red-400/90 text-sm">{err}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid lg:grid-cols-[240px_1fr_300px] gap-4 items-start">
        {/* (1) LEFT — palette */}
        <Card className="lg:sticky lg:top-4">
          <h2 className="text-sm font-bold text-white mb-1">Fields</h2>
          <p className="text-muted text-xs mb-3">Drag onto the canvas, or click to add.</p>
          <div className="space-y-4">
            {FORM_PALETTE.map((group) => (
              <div key={group.category}>
                <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1.5">
                  {group.category}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <div
                      key={item.key}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: 'palette', key: item.key }));
                        e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'palette', key: item.key }));
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => addFieldFromPalette(item.key)}
                      title={`Add ${item.label}`}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dark-border bg-dark-card hover:border-primary/60 hover:bg-dark-border/40 cursor-grab active:cursor-grabbing text-sm text-white/90 select-none"
                    >
                      <GripVertical className="w-4 h-4 text-muted shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      <span className="text-[10px] text-muted uppercase">{item.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* (2) CENTRE — canvas (drag handlers live on this wrapper: Card takes no event props) */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = dragIndex !== null ? 'move' : 'copy';
            if (dropIndex !== fields.length) setDropIndex(fields.length);
          }}
          onDrop={(e) => handleDrop(e, fields.length)}
        >
        <Card className="min-h-[480px]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">Form preview</h2>
            <span className="text-muted text-xs">Live preview — this is what submitters see</span>
          </div>

          {fields.length === 0 ? (
            <div
              className="border-2 border-dashed border-dark-border rounded-xl py-20 text-center"
              onDragOver={(e) => e.preventDefault()}
            >
              <MousePointerClick className="w-8 h-8 text-muted mx-auto mb-2" />
              <p className="text-white font-medium text-sm">No fields yet</p>
              <p className="text-muted text-xs mt-1">Drag a field from the left panel, or click one to add it here.</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {fields.map((field, index) => {
                const selected = field.id === selectedId;
                const isDropTarget = dropIndex === index;
                return (
                  <div
                    key={field.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: 'field', index }));
                      e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'field', index }));
                      e.dataTransfer.effectAllowed = 'move';
                      setDragIndex(index);
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDropIndex(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (dropIndex !== index) setDropIndex(index);
                    }}
                    onDrop={(e) => {
                      e.stopPropagation();
                      handleDrop(e, index);
                    }}
                    onClick={() => setSelectedId(field.id)}
                    className={cn(
                      'relative rounded-xl border p-3 cursor-pointer transition-colors',
                      field.styling?.width === 'half' ? 'sm:w-[calc(50%-0.375rem)] w-full' : 'w-full',
                      selected
                        ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                        : 'border-dark-border bg-dark-card hover:border-primary/40',
                      dragIndex === index && 'opacity-40',
                    )}
                  >
                    {isDropTarget && dragIndex !== null && dragIndex !== index && (
                      <div className="absolute -top-2 left-0 right-0 h-0.5 bg-primary rounded-full" />
                    )}
                    <div className="flex items-center gap-1 mb-2">
                      <GripVertical className="w-4 h-4 text-muted shrink-0 cursor-grab" />
                      <span className="text-[10px] text-muted uppercase flex-1 truncate">
                        {field.type} · {field.id}
                      </span>
                      <button
                        type="button"
                        title="Move up"
                        disabled={index === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveField(index, -1);
                        }}
                        className="text-muted hover:text-primary p-1 cursor-pointer disabled:opacity-30"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Move down"
                        disabled={index === fields.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveField(index, 1);
                        }}
                        className="text-muted hover:text-primary p-1 cursor-pointer disabled:opacity-30"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Duplicate field"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateField(index);
                        }}
                        className="text-muted hover:text-primary p-1 cursor-pointer"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Delete field"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteField(field.id);
                        }}
                        className="text-muted hover:text-red-400 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <FieldPreview field={field} />
                  </div>
                );
              })}
              {dropIndex === fields.length && dragIndex !== null && (
                <div className="w-full h-0.5 bg-primary rounded-full" />
              )}
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-dark-border">
            <Button variant="secondary" size="sm" disabled>
              {submitButtonText.trim() || 'Submit'}
            </Button>
            <p className="text-muted text-xs mt-2">
              After submitting, the user sees: “{successMessage.trim() || 'Thank you!'}”
            </p>
          </div>
        </Card>
        </div>

        {/* (3) RIGHT — field editor + form settings */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <Card>
            <h2 className="text-sm font-bold text-white mb-3">Form settings</h2>
            <div className="space-y-3">
              <Input
                label="Title"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  markDirty();
                }}
              />
              <Textarea
                label="Description"
                rows={2}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  markDirty();
                }}
              />
              <Input
                label="Submit button text"
                value={submitButtonText}
                onChange={(e) => {
                  setSubmitButtonText(e.target.value);
                  markDirty();
                }}
              />
              <Textarea
                label="Success message"
                rows={2}
                value={successMessage}
                onChange={(e) => {
                  setSuccessMessage(e.target.value);
                  markDirty();
                }}
              />
              <p className="text-xs text-muted">Type: {formTypeLabel(form.type)} · Slug: /{form.slug} (set at creation)</p>
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-bold text-white mb-3">Selected field</h2>
            {!selectedField ? (
              <p className="text-muted text-sm">
                Click a field on the canvas to edit its label, options, validation and styling.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="primary">{selectedField.type}</Badge>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    title="Deselect field"
                    className="text-muted hover:text-white p-1 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <Input
                  label="Label"
                  value={selectedField.label}
                  onChange={(e) => updateField(selectedField.id, { label: e.target.value })}
                />
                <Input
                  label="Placeholder"
                  value={selectedField.placeholder ?? ''}
                  onChange={(e) =>
                    updateField(selectedField.id, { placeholder: e.target.value || undefined })
                  }
                />
                <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedField.required}
                    onChange={(e) => updateField(selectedField.id, { required: e.target.checked })}
                    className="w-4 h-4 accent-primary"
                  />
                  Required field
                </label>

                {OPTION_FIELD_TYPES.includes(selectedField.type) && (
                  <div>
                    <span className="text-sm font-medium text-white/80 block mb-1.5">Options</span>
                    <div className="space-y-2">
                      {(selectedField.options ?? []).map((option, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Input
                            value={option}
                            placeholder={`Option ${i + 1}`}
                            onChange={(e) => {
                              const next = [...(selectedField.options ?? [])];
                              next[i] = e.target.value;
                              updateField(selectedField.id, { options: next });
                            }}
                          />
                          <button
                            type="button"
                            title="Remove option"
                            onClick={() => {
                              const next = (selectedField.options ?? []).filter((_, j) => j !== i);
                              updateField(selectedField.id, { options: next });
                            }}
                            className="text-muted hover:text-red-400 p-1 cursor-pointer shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-2"
                      onClick={() =>
                        updateField(selectedField.id, {
                          options: [...(selectedField.options ?? []), `Option ${(selectedField.options ?? []).length + 1}`],
                        })
                      }
                    >
                      <Plus className="w-4 h-4" />Add option
                    </Button>
                  </div>
                )}

                <div>
                  <span className="text-sm font-medium text-white/80 block mb-1.5">Validation</span>
                  <div className="grid grid-cols-2 gap-3">
                    {TEXT_FIELD_TYPES.includes(selectedField.type) && (
                      <>
                        <Input
                          label="Min length"
                          type="number"
                          min={0}
                          value={validation.minLength ?? ''}
                          onChange={(e) =>
                            updateValidation(selectedField.id, {
                              minLength: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                        />
                        <Input
                          label="Max length"
                          type="number"
                          min={0}
                          value={validation.maxLength ?? ''}
                          onChange={(e) =>
                            updateValidation(selectedField.id, {
                              maxLength: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                        />
                        <div className="col-span-2">
                          <Input
                            label="Pattern (regex)"
                            placeholder="e.g. ^[A-Za-z ]+$"
                            value={validation.pattern ?? ''}
                            onChange={(e) =>
                              updateValidation(selectedField.id, {
                                pattern: e.target.value || undefined,
                              })
                            }
                          />
                        </div>
                      </>
                    )}
                    {selectedField.type === 'number' && (
                      <>
                        <Input
                          label="Min value"
                          type="number"
                          value={validation.min ?? ''}
                          onChange={(e) =>
                            updateValidation(selectedField.id, {
                              min: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                        />
                        <Input
                          label="Max value"
                          type="number"
                          value={validation.max ?? ''}
                          onChange={(e) =>
                            updateValidation(selectedField.id, {
                              max: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                        />
                      </>
                    )}
                    {selectedField.type === 'date' && (
                      <p className="col-span-2 text-xs text-muted">
                        Dates have no extra validation — the date picker enforces a real date.
                      </p>
                    )}
                    {(selectedField.type === 'select' ||
                      selectedField.type === 'radio' ||
                      selectedField.type === 'checkbox') && (
                      <p className="col-span-2 text-xs text-muted">
                        Option fields validate by choice — add at least one option above.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-sm font-medium text-white/80 block mb-1.5">Styling</span>
                  <Select
                    label="Width"
                    options={[
                      { value: 'full', label: 'Full width' },
                      { value: 'half', label: 'Half width' },
                    ]}
                    value={selectedField.styling?.width ?? 'full'}
                    onChange={(e) =>
                      updateField(selectedField.id, {
                        styling: { width: e.target.value as 'full' | 'half' },
                      })
                    }
                  />
                </div>

                <Button
                  variant="danger"
                  size="sm"
                  fullWidth
                  onClick={() => deleteField(selectedField.id)}
                >
                  <Trash2 className="w-4 h-4" />Delete this field
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
