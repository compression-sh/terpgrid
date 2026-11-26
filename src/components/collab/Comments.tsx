import { CornerDownRight, Loader2, MessageSquare, Pencil, Send, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useConfirm } from '../../app/Confirm';
import { errorText, useToast } from '../../app/Toasts';
import { type CommentView, collab } from '../../lib/collab/api';
import { nameOf } from '../../lib/collab/labels';
import { Avatar, relTime } from './ui';

/** Kommentare zu einem Eintrag eines gemeinsamen Bereichs (eine Antwortebene). */
export function CommentsPanel({ spaceId, store, target }: { spaceId: string; store: string; target: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<CommentView[] | null>(null);
  const [canComment, setCanComment] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<CommentView | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await collab.comments(spaceId, store, target);
    setItems(r.comments);
    setCanComment(r.canComment);
  };
  useEffect(() => {
    load().catch(() => setItems([]));
    const t = setInterval(() => document.visibilityState !== 'hidden' && load().catch(() => {}), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, store, target]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      await collab.addComment(spaceId, store, target, t, replyTo?.id);
      setText('');
      setReplyTo(null);
      await load();
    } catch (err) {
      toast(errorText(err), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const saveEdit = async () => {
    if (!editing) return;
    try {
      await collab.editComment(spaceId, editing.id, editing.text.trim());
      setEditing(null);
      await load();
    } catch (err) {
      toast(errorText(err), { tone: 'error' });
    }
  };
  const remove = async (c: CommentView) => {
    const ok = await confirm({ title: 'Kommentar entfernen?', message: c.mine ? 'Dein Kommentar wird für alle Mitglieder entfernt.' : 'Der Kommentar wird als Eigentümer für alle entfernt.', confirmLabel: 'Entfernen', tone: 'danger' });
    if (!ok) return;
    try {
      await collab.deleteComment(spaceId, c.id);
      await load();
    } catch (err) {
      toast(errorText(err), { tone: 'error' });
    }
  };

  const top = (items ?? []).filter((c) => !c.parentId);
  const replies = (id: string) => (items ?? []).filter((c) => c.parentId === id);
  const render = (c: CommentView, nested = false) => (
    <li key={c.id} className={nested ? 'ml-9 mt-2' : ''}>
      <div className="flex gap-2.5">
        <Avatar identity={c.author} size={nested ? 'xs' : 'sm'} />
        <div className="min-w-0 flex-1 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2">
          <div className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
            <span className="font-medium text-ink-100">{nameOf(c.author)}</span>
            <span className="text-ink-500">
              {relTime(c.createdAt)}
              {c.editedAt && ' · bearbeitet'}
            </span>
          </div>
          {editing?.id === c.id ? (
            <div className="mt-1.5 space-y-2">
              <textarea aria-label="Kommentar bearbeiten" className="input-base min-h-16 resize-y" maxLength={2000} value={editing.text} onChange={(e) => setEditing({ id: c.id, text: e.target.value })} />
              <div className="flex gap-2">
                <button type="button" className="btn-primary py-1 text-[12px]" onClick={saveEdit} disabled={!editing.text.trim()}>
                  Speichern
                </button>
                <button type="button" className="btn-ghost py-1 text-[12px]" onClick={() => setEditing(null)}>
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <p className={`mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed ${c.deleted ? 'italic text-ink-500' : 'text-ink-200'}`}>{c.deleted ? 'Kommentar entfernt' : c.text}</p>
          )}
          {!c.deleted && editing?.id !== c.id && (
            <div className="mt-1 flex flex-wrap gap-3 text-[11.5px]">
              {canComment && !nested && (
                <button type="button" className="inline-flex min-h-6 items-center gap-1 text-ink-400 hover:text-ink-100" onClick={() => setReplyTo(c)}>
                  <CornerDownRight className="size-3" /> Antworten
                </button>
              )}
              {c.canEdit && (
                <button type="button" className="inline-flex min-h-6 items-center gap-1 text-ink-400 hover:text-ink-100" onClick={() => setEditing({ id: c.id, text: c.text ?? '' })}>
                  <Pencil className="size-3" /> Bearbeiten
                </button>
              )}
              {c.canDelete && (
                <button type="button" className="inline-flex min-h-6 items-center gap-1 text-ink-400 hover:text-rose-300" onClick={() => remove(c)}>
                  <Trash2 className="size-3" /> Entfernen
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {!nested && replies(c.id).length > 0 && <ul>{replies(c.id).map((r) => render(r, true))}</ul>}
    </li>
  );

  return (
    <section aria-label="Kommentare" className="space-y-3">
      <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink-100">
        <MessageSquare className="size-4 text-leaf-400" /> Kommentare {items && items.filter((c) => !c.deleted).length > 0 && <span className="text-ink-500">({items.filter((c) => !c.deleted).length})</span>}
      </h3>
      {items === null ? (
        <div className="py-4 text-ink-400" role="status">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : top.length === 0 ? (
        <p className="text-[12.5px] text-ink-400">{canComment ? 'Noch keine Kommentare – schreib den ersten.' : 'Noch keine Kommentare.'}</p>
      ) : (
        <ul className="space-y-3">{top.map((c) => render(c))}</ul>
      )}
      {canComment ? (
        <form onSubmit={submit} className="space-y-2">
          {replyTo && (
            <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-1.5 text-[12px] text-ink-300">
              <span>Antwort an {nameOf(replyTo.author)}</span>
              <button type="button" className="text-ink-400 hover:text-ink-100" onClick={() => setReplyTo(null)}>
                Abbrechen
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              aria-label={replyTo ? 'Antwort schreiben' : 'Kommentar schreiben'}
              placeholder={replyTo ? 'Antwort schreiben …' : 'Kommentar schreiben …'}
              className="input-base min-h-10 flex-1 resize-y"
              rows={2}
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" className="btn-primary" disabled={busy || !text.trim()} aria-label="Kommentar senden">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </div>
          <p className="hint">Kommentare sehen alle Mitglieder, die diesen Eintrag sehen dürfen. Gespeichert verschlüsselt mit dem Bereichsschlüssel.</p>
        </form>
      ) : (
        <p className="hint">Mit der Rolle „Ansehen“ kannst du Kommentare lesen, aber nicht schreiben.</p>
      )}
    </section>
  );
}
