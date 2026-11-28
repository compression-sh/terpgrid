import { Camera, Eye, Loader2, Lock, RefreshCw, Save, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useConfirm } from '../../app/Confirm';
import { useLoad } from '../../app/collab';
import { errorText, useToast } from '../../app/Toasts';
import { Avatar, SectionTitle } from '../../components/collab/ui';
import { ChipSelect } from '../../components/forms/Fields';
import { Callout } from '../../components/ui/Callout';
import { PageHeader } from '../../components/ui/PageHeader';
import { Toggle } from '../../components/ui/Toggle';
import { type Accent, type ProfileField, type SelfProfile, type Visibility, collab } from '../../lib/collab/api';
import { ACCENTS, ACCENT_CLASS, ACCENT_LABEL } from '../../lib/collab/labels';
import { TERPENE_SUGGESTIONS } from '../../lib/grow/labels';
import { TogetherTabs } from './TogetherTabs';
import { labels, t } from '../../i18n';

const FIELD_LABEL = labels('collab.field', ['displayName', 'bio', 'accent', 'avatar', 'favoriteStrains', 'favoriteTerpenes', 'interests'] as ProfileField[]);
const interestSuggestions = () => t('collab.pf.interests').split('|');

/** Avatar verkleinern (max. 256 px, WebP/JPEG) – Bild verlässt den Browser nur als kleine Kopie. */
async function shrinkAvatar(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(t('collab.pf.badType'));
  const bmp = await createImageBitmap(file);
  const s = 256 / Math.max(bmp.width, bmp.height, 256);
  const w = Math.round(bmp.width * Math.min(1, 256 / Math.max(bmp.width, bmp.height)));
  const h = Math.round(bmp.height * Math.min(1, 256 / Math.max(bmp.width, bmp.height)));
  void s;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  for (const q of [0.85, 0.7, 0.55]) {
    const url = c.toDataURL('image/webp', q);
    const out = url.startsWith('data:image/webp') ? url : c.toDataURL('image/jpeg', q);
    if (out.length * 0.75 < 110 * 1024) return out;
  }
  throw new Error(t('collab.pf.tooBig'));
}

export function ProfilePage() {
  const toast = useToast();
  const confirm = useConfirm();
  const loaded = useLoad(() => collab.profile(), []);
  const [p, setP] = useState<SelfProfile | null>(null);
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (loaded.data) {
      setP(loaded.data.profile);
      setHandle(loaded.data.profile.handle ?? '');
    }
  }, [loaded.data]);
  const dirty = useMemo(() => JSON.stringify(p) !== JSON.stringify(loaded.data?.profile) || handle !== (loaded.data?.profile.handle ?? ''), [p, handle, loaded.data]);

  if (!p) return <div className="space-y-4">{loaded.error ? <Callout tone="danger">{loaded.error}</Callout> : <div className="skeleton h-64" />}</div>;
  const set = <K extends keyof SelfProfile>(k: K, v: SelfProfile[K]) => setP({ ...p, [k]: v });
  const vis = (f: ProfileField) => p.visibility[f];
  const setVis = (f: ProfileField, v: Visibility) => setP({ ...p, visibility: { ...p.visibility, [f]: v } });

  const save = async () => {
    setBusy(true);
    try {
      const r = await collab.updateProfile({
        displayName: p.displayName ?? '',
        bio: p.bio ?? '',
        accent: p.accent,
        avatar: p.avatar ?? '',
        favoriteStrains: p.favoriteStrains ?? [],
        favoriteTerpenes: p.favoriteTerpenes ?? [],
        interests: p.interests ?? [],
        visibility: p.visibility,
        requestsEnabled: p.requestsEnabled,
        ...(handle !== (loaded.data?.profile.handle ?? '') ? { handle: handle.trim() || null } : {}),
      });
      setP(r.profile);
      await loaded.reload();
      toast(t('collab.pf.saved'));
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const regenerate = async () => {
    const ok = await confirm({ title: t('collab.pf.regenTitle'), message: t('collab.pf.regenMsg'), confirmLabel: t('collab.pf.regen') });
    if (!ok) return;
    try {
      const r = await collab.regenerateSocialId();
      setP(r.profile);
      await loaded.reload();
      toast(t('collab.pf.regenerated'));
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  };

  const VisSwitch = ({ f }: { f: ProfileField }) => (
    <div role="radiogroup" aria-label={t('collab.pf.visibilityOf', { field: FIELD_LABEL[f] })} className="inline-flex rounded-lg border border-white/[0.08] p-0.5 text-[11.5px]">
      {(['private', 'friends'] as Visibility[]).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={vis(f) === v}
          onClick={() => setVis(f, v)}
          className={`inline-flex min-h-6 items-center gap-1 rounded-md px-2 ${vis(f) === v ? (v === 'private' ? 'bg-white/[0.08] text-ink-100' : 'bg-leaf-500/15 text-leaf-200') : 'text-ink-400 hover:text-ink-200'}`}
        >
          {v === 'private' ? <Lock className="size-3" /> : <Users className="size-3" />} {v === 'private' ? t('collab.pf.onlyMe') : t('collab.pf.friends')}
        </button>
      ))}
    </div>
  );
  const Row = ({ f, children }: { f: ProfileField; children: React.ReactNode }) => (
    <div className="space-y-2 border-t border-white/[0.05] py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label">{FIELD_LABEL[f]}</span>
        <VisSwitch f={f} />
      </div>
      {children}
    </div>
  );

  const preview = {
    ref: p.ref,
    handle: p.handle,
    socialId: p.socialId,
    displayName: vis('displayName') === 'friends' ? (p.displayName ?? null) : null,
    avatar: vis('avatar') === 'friends' ? (p.avatar ?? null) : null,
  };
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('collab.pf.title')}
        subtitle={t('collab.pf.subtitle')}
        actions={
          <button type="button" className="btn-primary" disabled={busy || !dirty} onClick={save}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {t('common.save.button')}
          </button>
        }
      />
      <TogetherTabs active="profile" />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="card p-4 sm:p-5" aria-label={t('collab.pf.details')}>
          <Row f="avatar">
            <div className="flex items-center gap-4">
              <Avatar identity={{ ...preview, avatar: p.avatar ?? null }} size="lg" accent={p.accent} />
              <label className="btn-ghost cursor-pointer text-[12.5px]">
                <Camera className="size-4" /> {t('collab.pf.chooseImg')}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    try {
                      set('avatar', await shrinkAvatar(f));
                    } catch (err) {
                      toast(errorText(err), { tone: 'error' });
                    }
                  }}
                />
              </label>
              {p.avatar && (
                <button type="button" className="btn-ghost p-1.5" aria-label={t('collab.pf.removeImg')} onClick={() => set('avatar', undefined)}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
            <p className="hint">{t('collab.pf.imgHint')}</p>
          </Row>
          <Row f="displayName">
            <input className="input-base" maxLength={40} value={p.displayName ?? ''} onChange={(e) => set('displayName', e.target.value)} placeholder={t('collab.pf.namePh')} />
          </Row>
          <Row f="bio">
            <textarea className="input-base min-h-24 resize-y" maxLength={500} value={p.bio ?? ''} onChange={(e) => set('bio', e.target.value)} placeholder={t('collab.pf.bioPh')} />
          </Row>
          <Row f="accent">
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((a: Accent) => (
                <button
                  key={a}
                  type="button"
                  aria-label={ACCENT_LABEL[a]}
                  aria-pressed={p.accent === a}
                  onClick={() => set('accent', a)}
                  className={`size-8 rounded-full ${ACCENT_CLASS[a].dot} ring-offset-2 ring-offset-ink-900 ${p.accent === a ? 'ring-2 ring-white/80' : 'opacity-70 hover:opacity-100'}`}
                />
              ))}
            </div>
          </Row>
          <Row f="favoriteStrains">
            <TagInput value={p.favoriteStrains ?? []} onChange={(v) => set('favoriteStrains', v)} placeholder={t('collab.pf.strainPh')} label="Lieblingssorten" />
          </Row>
          <Row f="favoriteTerpenes">
            <ChipSelect label="Lieblingsterpene" options={TERPENE_SUGGESTIONS} value={p.favoriteTerpenes ?? []} onChange={(v) => set('favoriteTerpenes', v.slice(0, 12))} />
          </Row>
          <Row f="interests">
            <ChipSelect label="Interessen" options={interestSuggestions()} value={p.interests ?? []} onChange={(v) => set('interests', v.slice(0, 12))} />
          </Row>
        </section>

        <div className="space-y-4">
          <section className="card p-4 sm:p-5" aria-label={t('collab.pf.ids')}>
            <SectionTitle>{t('collab.pf.yourIds')}</SectionTitle>
            <label className="block space-y-1.5">
              <span className="label">{t('collab.pf.handle')}</span>
              <div className="flex items-center gap-1">
                <span className="text-ink-400">@</span>
                <input className="input-base" maxLength={24} value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/^@/, ''))} placeholder={t('collab.pf.free')} autoComplete="off" spellCheck={false} />
              </div>
              <span className="hint block">{t('collab.pf.handleHint')}</span>
            </label>
            <div className="mt-4 space-y-1">
              <span className="label">{t('collab.pf.social')}</span>
              <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
                <span className="font-mono text-[13px] text-ink-100">{p.socialId}</span>
                <button type="button" className="inline-flex min-h-6 items-center gap-1 text-[12px] text-ink-400 hover:text-ink-100" onClick={regenerate}>
                  <RefreshCw className="size-3.5" /> {t('collab.pf.regen')}
                </button>
              </div>
            </div>
            <div className="mt-4">
              <Toggle label={t('collab.pf.allow')} hint={t('collab.pf.allowHint')} checked={p.requestsEnabled} onChange={(v) => set('requestsEnabled', v)} />
            </div>
          </section>

          <section className="card p-4 sm:p-5" aria-label={t('collab.pf.preview')}>
            <SectionTitle>
              <span className="inline-flex items-center gap-1.5">
                <Eye className="size-3.5" /> {t('collab.pf.preview')}
              </span>
            </SectionTitle>
            <div className="flex items-center gap-3">
              <Avatar identity={preview} size="md" accent={vis('accent') === 'friends' ? p.accent : undefined} />
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold text-ink-50">{preview.displayName || (p.handle ? `@${p.handle}` : p.socialId)}</div>
                <div className="text-[12px] text-ink-400">{p.handle ? `@${p.handle}` : p.socialId}</div>
              </div>
            </div>
            {vis('bio') === 'friends' && p.bio && <p className="mt-3 whitespace-pre-wrap text-[12.5px] text-ink-300">{p.bio}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(['favoriteStrains', 'favoriteTerpenes', 'interests'] as const).flatMap((f) => (vis(f) === 'friends' ? (p[f] ?? []).map((x) => <span key={`${f}-${x}`} className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[11.5px] text-ink-300">{x}</span>) : []))}
            </div>
            <p className="hint mt-3">{t('collab.pf.membersSee')}</p>
          </section>
        </div>
      </div>
    </div>
  );
}

function TagInput({ value, onChange, placeholder, label }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; label: string }) {
  const [text, setText] = useState('');
  const add = () => {
    const val = text.trim();
    if (val && !value.includes(val) && value.length < 12) onChange([...value, val.slice(0, 40)]);
    setText('');
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[12px] text-ink-200">
            {v}
            <button type="button" aria-label={t('collab.pf.removeX', { v })} className="text-ink-400 hover:text-ink-100" onClick={() => onChange(value.filter((x) => x !== v))}>
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        aria-label={label}
        className="input-base"
        value={text}
        maxLength={40}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}
