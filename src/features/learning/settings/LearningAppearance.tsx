import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, CircleAlert, Monitor, Moon, Palette, RotateCcw, ShieldCheck, Sun, X } from 'lucide-react';
import { appearanceModes, appearancePalettes } from '../../../../shared/appearance.mjs';
import type { ThemeMode, ThemePalette } from '../../../../shared/appearance.mjs';
import { useDialogFocus } from '../../../shared/lib/focus';
import { themeVariables } from '../../../shared/theme/theme-tokens.mjs';
import type { useSpaceTheme } from '../../../shared/theme/use-space-theme';
import './learning-appearance.css';

type ThemeState = ReturnType<typeof useSpaceTheme>;
const modeIcons = { system: Monitor, light: Sun, dark: Moon };
const paletteLabel = (palette: ThemePalette) => appearancePalettes.find(value => value.value === palette)?.label || '';
const modeLabel = (mode: ThemeMode) => appearanceModes.find(value => value.value === mode)?.label || '';

function AppearanceDialog({ theme, onClose }: { theme: ThemeState; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null), backdropRef = useRef<HTMLDivElement>(null);
  useDialogFocus(ref);
  useEffect(() => {
    const backdrop = backdropRef.current;
    const background = Array.from(document.body.children).filter(element => element !== backdrop).map(element => ({ element: element as HTMLElement, inert: (element as HTMLElement).inert }));
    const overflow = document.body.style.overflow;
    background.forEach(({ element }) => { element.inert = true; }); document.body.style.overflow = 'hidden';
    return () => { background.forEach(({ element, inert }) => { element.inert = inert; }); document.body.style.overflow = overflow; };
  }, []);
  const managed = theme.preferences.palette === 'managed' && theme.preferences.mode === 'managed';
  return createPortal(<div className="modal-backdrop learning-appearance-backdrop" ref={backdropRef} onClick={onClose}>
    <section className="modal learning-appearance-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="learning-appearance-title" aria-describedby="learning-appearance-description" onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); onClose(); } }}>
      <button type="button" className="icon-button modal-close" aria-label="关闭主题设置" onClick={onClose}><X size={20} /></button>
      <span className="learning-appearance-symbol"><Palette size={24} /></span><h2 id="learning-appearance-title">主题与外观</h2>
      <p id="learning-appearance-description">即时调整两科学习空间的外观。个人偏好仅保存在当前浏览器，不随账号同步。</p>
      <fieldset className="learning-appearance-field"><legend>主题色</legend>
        <label className={`learning-appearance-managed ${theme.preferences.palette === 'managed' ? 'is-selected' : ''}`}><input type="radio" name="learning-palette" aria-label="主题色：使用管理设置" checked={theme.preferences.palette === 'managed'} onChange={() => theme.setPreference({ palette: 'managed' })} /><span><ShieldCheck size={17} /><strong>使用管理设置</strong></span><small>随学科应用管理员配置的颜色</small>{theme.preferences.palette === 'managed' && <Check size={16} />}</label>
        <div className="learning-appearance-palettes">{appearancePalettes.map(palette => <label className={`learning-appearance-palette ${theme.preferences.palette === palette.value ? 'is-selected' : ''}`} key={palette.value}><input type="radio" name="learning-palette" aria-label={`主题色：${palette.label}`} checked={theme.preferences.palette === palette.value} onChange={() => theme.setPreference({ palette: palette.value })} /><span style={{ background: themeVariables(palette.value, theme.scheme)['--accent'], color: themeVariables(palette.value, theme.scheme)['--on-accent'] }}>{theme.preferences.palette === palette.value && <Check size={16} />}</span><strong>{palette.label}</strong></label>)}</div>
      </fieldset>
      <fieldset className="learning-appearance-field"><legend>明暗模式</legend>
        <label className={`learning-appearance-managed ${theme.preferences.mode === 'managed' ? 'is-selected' : ''}`}><input type="radio" name="learning-mode" aria-label="明暗模式：使用管理设置" checked={theme.preferences.mode === 'managed'} onChange={() => theme.setPreference({ mode: 'managed' })} /><span><ShieldCheck size={17} /><strong>使用管理设置</strong></span><small>当前为{modeLabel(theme.configuration.mode)}</small>{theme.preferences.mode === 'managed' && <Check size={16} />}</label>
        <div className="learning-appearance-modes">{appearanceModes.map(mode => {
          const Icon = modeIcons[mode.value];
          return <label className={`learning-appearance-mode ${theme.preferences.mode === mode.value ? 'is-selected' : ''}`} key={mode.value}><input type="radio" name="learning-mode" aria-label={`明暗模式：${mode.label}`} checked={theme.preferences.mode === mode.value} onChange={() => theme.setPreference({ mode: mode.value })} /><Icon size={18} /><strong>{mode.label}</strong>{theme.preferences.mode === mode.value && <Check size={14} />}</label>;
        })}</div>
      </fieldset>
      <p className="learning-appearance-current" role="status">当前使用：{paletteLabel(theme.palette)} · {theme.scheme === 'dark' ? '深色' : '浅色'}</p>
      {!theme.preferencePersisted && <p className="learning-appearance-storage-error" role="alert"><CircleAlert size={16} />浏览器未能保存偏好，本次修改仅在当前页面生效。</p>}
      <div className="learning-appearance-actions"><button type="button" className="btn btn-secondary" disabled={managed} onClick={theme.resetPreference}><RotateCcw size={16} />恢复管理设置</button><button type="button" className="btn btn-primary" onClick={onClose}>完成</button></div>
    </section>
  </div>, document.body);
}

export default function LearningAppearance({ theme }: { theme: ThemeState }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  function close() { setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus()); }
  return <><button type="button" className="learning-appearance-trigger icon-button" aria-label="主题与外观" title="主题与外观" aria-haspopup="dialog" aria-expanded={open} ref={triggerRef} onClick={() => setOpen(true)}><Palette size={19} /></button>{open && <AppearanceDialog theme={theme} onClose={close} />}</>;
}
