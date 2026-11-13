// Interactive AcroForm filling using pdf-lib for field discovery and writing.
import {
  PDFDocument, PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList, PDFSignature, PDFName, PDFRef, PDFDict,
} from 'pdf-lib';

export type FieldKind = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'list' | 'signature';

export interface FormWidget {
  fieldName: string;
  kind: FieldKind;
  pageIndex: number;
  /** PDF user-space rect [x1,y1,x2,y2] */
  rect: [number, number, number, number];
  /** For radio widgets: the option this widget selects. */
  option?: string;
  multiline?: boolean;
  options?: string[];
  readOnly?: boolean;
  maxLength?: number;
  fontSize?: number;
}

export type FieldValue = string | boolean | string[];

export interface FormInfo {
  widgets: FormWidget[];
  values: Map<string, FieldValue>;
}

export async function readForm(doc: PDFDocument): Promise<FormInfo> {
  const widgets: FormWidget[] = [];
  const values = new Map<string, FieldValue>();
  let form;
  try {
    form = doc.getForm();
  } catch {
    return { widgets, values };
  }
  const pages = doc.getPages();
  const refIndex = new Map<string, number>();
  pages.forEach((p, i) => refIndex.set(p.ref.toString(), i));
  // Fallback: page lookup through each page's /Annots
  const annotPage = new Map<string, number>();
  pages.forEach((p, i) => {
    const annots = p.node.Annots();
    if (!annots) return;
    for (let k = 0; k < annots.size(); k++) {
      const r = annots.get(k);
      if (r instanceof PDFRef) annotPage.set(r.toString(), i);
    }
  });

  for (const field of form.getFields()) {
    const name = field.getName();
    let kind: FieldKind | null = null;
    if (field instanceof PDFTextField) kind = 'text';
    else if (field instanceof PDFCheckBox) kind = 'checkbox';
    else if (field instanceof PDFRadioGroup) kind = 'radio';
    else if (field instanceof PDFDropdown) kind = 'dropdown';
    else if (field instanceof PDFOptionList) kind = 'list';
    else if (field instanceof PDFSignature) kind = 'signature';
    if (!kind) continue;
    try {
      if (field instanceof PDFTextField) values.set(name, field.getText() || '');
      else if (field instanceof PDFCheckBox) values.set(name, field.isChecked());
      else if (field instanceof PDFRadioGroup) values.set(name, field.getSelected() || '');
      else if (field instanceof PDFDropdown) values.set(name, field.getSelected()[0] || '');
      else if (field instanceof PDFOptionList) values.set(name, field.getSelected());
    } catch {
      /* malformed field */
    }
    const ro = field.isReadOnly();
    const widgetsList = field.acroField.getWidgets();
    let radioOpts: string[] = [];
    if (field instanceof PDFRadioGroup) {
      try { radioOpts = field.getOptions(); } catch { radioOpts = []; }
    }
    let options: string[] | undefined;
    if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      try { options = field.getOptions(); } catch { options = []; }
    }
    widgetsList.forEach((w, wi) => {
      let pageIndex = -1;
      const P = w.P();
      if (P) pageIndex = refIndex.get(P.toString()) ?? -1;
      if (pageIndex < 0) {
        const ref = doc.context.getObjectRef(w.dict);
        if (ref) pageIndex = annotPage.get(ref.toString()) ?? -1;
      }
      if (pageIndex < 0) return;
      const r = w.getRectangle();
      if (r.width <= 0 || r.height <= 0) return;
      const fw: FormWidget = { fieldName: name, kind: kind!, pageIndex, rect: [r.x, r.y, r.x + r.width, r.y + r.height], readOnly: ro };
      if (kind === 'radio') {
        let opt = radioOpts.length === widgetsList.length ? radioOpts[wi] : undefined;
        if (!opt) {
          const on = w.getOnValue();
          opt = on ? on.decodeText() : String(wi);
        }
        fw.option = opt;
      }
      if (field instanceof PDFTextField) {
        fw.multiline = field.isMultiline();
        fw.maxLength = field.getMaxLength();
        const da = w.getDefaultAppearance() || (field.acroField.getDefaultAppearance?.() ?? '');
        const m = /([\d.]+)\s+Tf/.exec(da || '');
        if (m) fw.fontSize = parseFloat(m[1]) || undefined;
      }
      if (options) fw.options = options;
      widgets.push(fw);
    });
  }
  return { widgets, values };
}

export async function writeForm(doc: PDFDocument, values: Map<string, FieldValue>, flatten = false): Promise<string[]> {
  const problems: string[] = [];
  let form;
  try {
    form = doc.getForm();
  } catch {
    return problems;
  }
  for (const [name, v] of values) {
    try {
      const f = form.getField(name);
      if (f instanceof PDFTextField) {
        const ml = f.getMaxLength();
        f.setText(ml ? String(v).slice(0, ml) : String(v));
      } else if (f instanceof PDFCheckBox) v ? f.check() : f.uncheck();
      else if (f instanceof PDFRadioGroup) {
        if (v) f.select(String(v));
        else f.clear();
      } else if (f instanceof PDFDropdown) {
        if (v) f.select(String(v));
        else f.clear();
      } else if (f instanceof PDFOptionList) {
        const arr = Array.isArray(v) ? v : [String(v)];
        if (arr.length) f.select(arr);
        else f.clear();
      }
    } catch (e) {
      problems.push(name);
      console.warn('Field write failed', name, e);
    }
  }
  try {
    form.updateFieldAppearances();
  } catch (e) {
    // Fall back to asking viewers to regenerate appearances.
    try {
      form.acroForm.dict.set(PDFName.of('NeedAppearances'), doc.context.obj(true));
    } catch { /* ignore */ }
    console.warn('updateFieldAppearances failed', e);
  }
  if (flatten) {
    try {
      form.flatten();
    } catch (e) {
      problems.push('(flatten)');
      console.warn('flatten failed', e);
    }
  }
  return problems;
}

export function hasXfa(doc: PDFDocument): boolean {
  try {
    const af = doc.catalog.lookup(PDFName.of('AcroForm'));
    return af instanceof PDFDict && !!af.get(PDFName.of('XFA'));
  } catch {
    return false;
  }
}
