import { Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useConfirm } from '../../app/Confirm';
import { useData, useLookup } from '../../app/DataProvider';
import { errorText, useToast } from '../../app/Toasts';
import { fmtDate } from '../../lib/dates';
import { deleteSimple } from '../../lib/db/repo';
import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory } from '../../lib/db/types';
import { EXPENSE_CATEGORY_LABEL } from '../../lib/grow/labels';
import { ExpenseFormModal } from '../forms/GrowForms';
import { EmptyState } from '../ui/EmptyState';
import { t, intlLocale } from '../../i18n';

export function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(intlLocale(), { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function sumByCategory(expenses: Expense[]): { category: ExpenseCategory; total: number }[] {
  return EXPENSE_CATEGORIES.map((c) => ({ category: c, total: expenses.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0) })).filter((x) => x.total > 0);
}

export const CATEGORY_COLOR: Record<ExpenseCategory, string> = {
  equipment: '#5fe39a',
  seeds: '#c084fc',
  nutrients: '#38bdf8',
  medium: '#d6a36a',
  electricity: '#facc15',
  water: '#7dd3fc',
  other: '#8c9a95',
};

/** Ausgaben mit Summen je Kategorie; Bearbeiten/Löschen je Eintrag. */
export function ExpenseList({ expenses, growId, showGrow }: { expenses: Expense[]; growId?: string; showGrow?: boolean }) {
  const { settings } = useData();
  const lookup = useLookup();
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState<{ expense?: Expense } | null>(null);
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byCat = sumByCategory(expenses);
  const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date));

  async function remove(e: Expense) {
    if (!(await confirm({ title: t('grow.expense.deleteTitle'), message: t('grow.expense.deleteText', { amount: money(e.amount, settings.currency), date: fmtDate(e.date) }), confirmLabel: t('common.delete'), tone: 'danger' }))) return;
    try {
      await deleteSimple('expenses', e.id);
      toast(t('grow.expense.deleted'));
    } catch (err) {
      toast(errorText(err), { tone: 'error' });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs text-ink-400">{t('grow.expense.total')}</div>
          <div className="font-mono text-2xl font-semibold tabular text-ink-50">{money(total, settings.currency)}</div>
        </div>
        <button type="button" className="btn-ghost" onClick={() => setForm({})}>
          <Plus className="size-4" /> Ausgabe
        </button>
      </div>
      {byCat.length > 0 && (
        <div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-ink-700">
            {byCat.map((c) => (
              <div key={c.category} style={{ width: `${(c.total / total) * 100}%`, background: CATEGORY_COLOR[c.category] }} title={`${EXPENSE_CATEGORY_LABEL[c.category]}: ${money(c.total, settings.currency)}`} />
            ))}
          </div>
          <ul className="mt-2.5 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            {byCat.map((c) => (
              <li key={c.category} className="flex items-center justify-between gap-2 text-ink-300">
                <span className="flex items-center gap-2">
                  <span className="size-2 rounded-sm" style={{ background: CATEGORY_COLOR[c.category] }} />
                  {EXPENSE_CATEGORY_LABEL[c.category]}
                </span>
                <span className="font-mono tabular text-ink-200">{money(c.total, settings.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {sorted.length === 0 ? (
        <EmptyState compact icon={<Receipt />} title={t('grow.expense.none')} />
      ) : (
        <ul className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.05]">
          {sorted.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="size-2 shrink-0 rounded-sm" style={{ background: CATEGORY_COLOR[e.category] }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-ink-100">{e.description || EXPENSE_CATEGORY_LABEL[e.category]}</div>
                <div className="text-[11px] text-ink-500">
                  {fmtDate(e.date)} · {EXPENSE_CATEGORY_LABEL[e.category]}
                  {showGrow && e.growId && ` · ${lookup.grow.get(e.growId)?.name ?? ''}`}
                </div>
              </div>
              <span className="font-mono text-[13px] tabular text-ink-100">{money(e.amount, settings.currency)}</span>
              <button type="button" className="btn-ghost border-transparent bg-transparent p-1.5" aria-label={t('common.edit')} onClick={() => setForm({ expense: e })}>
                <Pencil className="size-3.5" />
              </button>
              <button type="button" className="btn-ghost border-transparent bg-transparent p-1.5 hover:text-rose-300" aria-label={t('common.delete')} onClick={() => remove(e)}>
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {form && <ExpenseFormModal open onClose={() => setForm(null)} expense={form.expense} growId={growId} />}
    </div>
  );
}
