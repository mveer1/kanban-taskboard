import { useEffect, useState } from 'react';
import type { Density, Settings } from '@/types/board';
import { COLUMNS } from '@/config/columns';
import { unregisteredTags } from '@/store/selectors';
import { useBoard, useBoardStore } from '@/store/BoardContext';
import { useUi } from '@/store/UiContext';
import { useWorkspaces } from '@/store/WorkspaceContext';
import { useToast } from '@/components/ui/Toast';
import { Field, FieldRow } from '@/components/ui/Modal';
import { ColorSwatchPicker } from '@/components/ui/ColorSwatchPicker';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { CONFIRM_LABELS, type ConfirmKey } from '@/components/ui/Confirm';
import type { BackupEntry } from '@/data/types';
import type { Hotkey } from '@/hooks/useHotkeys';
import './SettingsPage.css';

/** Grouped card. */
function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section">
      <header>
        <h2>{title}</h2>
        {hint ? <p className="settings-hint">{hint}</p> : null}
      </header>
      <div className="settings-body">{children}</div>
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="toggle-label">{label}</span>
        {hint ? <span className="settings-hint">{hint}</span> : null}
      </span>
    </label>
  );
}

export function SettingsPage({ hotkeys }: { hotkeys: Hotkey[] }) {
  const { board, settings } = useBoard();
  const { updateSettings, reload, source, canEdit } = useBoardStore();
  const ui = useUi();
  const ws = useWorkspaces();
  const notify = useToast();

  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const orphanTags = unregisteredTags(board);

  const caps = source?.capabilities;
  const fileBacked = caps?.fileBacked ?? false;

  const loadBackups = () => {
    void source
      ?.listBackups()
      .then(setBackups)
      .catch(() => {});
  };
  // Re-runs when the backend changes, e.g. after switching workspace.
  useEffect(loadBackups, [source]);

  /* Live-apply appearance so changes are visible immediately. */
  useEffect(() => {
    document.documentElement.dataset.theme =
      settings.appearance.theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : settings.appearance.theme;
    document.documentElement.dataset.radius = settings.appearance.radiusScale;
  }, [settings.appearance.theme, settings.appearance.radiusScale]);

  const patch = <K extends keyof Settings>(key: K, value: Partial<Settings[K]>) =>
    updateSettings({ [key]: { ...settings[key], ...value } } as Partial<Settings>);

  const setDensity = (status: string, density: Density) =>
    patch('board', { density: { ...settings.board.density, [status]: density } });

  return (
    <div className="settings-page">
      <Section
        title="Workspace"
        hint="Where this board is stored, and who can reach it."
      >
        <dl className="backend-facts">
          <dt>Storage</dt>
          <dd>{source?.describe ?? 'Not connected'}</dd>

          {caps?.workspaces && ws.active ? (
            <>
              <dt>Workspace</dt>
              <dd className="backend-workspace">
                {ws.active.name}
                <RoleBadge role={ws.active.role} />
                <span className="settings-hint">
                  {ws.active.memberCount} member{ws.active.memberCount === 1 ? '' : 's'}
                </span>
              </dd>
            </>
          ) : null}

          <dt>Your access</dt>
          <dd>{canEdit ? 'Read and write' : 'Read-only'}</dd>
        </dl>

        {caps?.workspaces ? (
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button onClick={() => ui.setMembersOpen(true)}>Members and sharing</button>
            <button className="ghost" onClick={() => ui.setAccountOpen(true)}>
              Account
            </button>
          </div>
        ) : (
          <p className="settings-hint" style={{ marginTop: 10 }}>
            This build uses the local file backend, so there is no account and no sharing.
            Deploy the Firebase build to enable both — see <code>DEPLOYMENT.md</code>.
          </p>
        )}
      </Section>

      <Section
        title="Profile"
        hint={
          caps?.perUserSettings
            ? 'Display identity for this account. Stored against your user, not the board.'
            : 'Local single-user identity, stored in data/settings.json.'
        }
      >
        <div className="profile-row">
          <span className="avatar lg" style={{ background: settings.profile.avatarColor }}>
            {settings.profile.initials}
          </span>
          <div className="profile-fields">
            <FieldRow cols={2}>
              <Field label="Name">
                <input
                  type="text"
                  value={settings.profile.name}
                  onChange={(e) => patch('profile', { name: e.target.value })}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={settings.profile.email}
                  onChange={(e) => patch('profile', { email: e.target.value })}
                />
              </Field>
            </FieldRow>
            <Field label="Initials" hint="Shown in the avatar. Two characters works best.">
              <input
                type="text"
                maxLength={3}
                style={{ width: 90 }}
                value={settings.profile.initials}
                onChange={(e) => patch('profile', { initials: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Avatar color">
              <ColorSwatchPicker
                value={settings.profile.avatarColor}
                onChange={(avatarColor) => patch('profile', { avatarColor })}
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section
        title="Card density"
        hint="Each column renders its story cards independently. Compact is a tile; normal shows description, tags, links, and tasks. Clicking any card opens the full detail view."
      >
        <div className="density-grid">
          {COLUMNS.map((c) => (
            <div className="density-row" key={c.id}>
              <span className="density-name" style={{ color: c.accent }}>
                {c.title}
              </span>
              <span className="settings-hint density-hint">{c.hint}</span>
              <div className="density-choice">
                {(['compact', 'normal'] as Density[]).map((d) => (
                  <button
                    key={d}
                    className={`chip${settings.board.density[c.id] === d ? ' on' : ''}`}
                    onClick={() => setDensity(c.id, d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Board">
        <Toggle
          label="Auto-expand active stories"
          hint="Show task lists for Active stories on load."
          checked={settings.board.autoExpandActive}
          onChange={(autoExpandActive) => patch('board', { autoExpandActive })}
        />
        <Toggle
          label="Show stats below the board"
          checked={settings.board.showStats}
          onChange={(showStats) => patch('board', { showStats })}
        />
        <Toggle
          label="Show dependency graph on Insights"
          checked={settings.board.showGraph}
          onChange={(showGraph) => patch('board', { showGraph })}
        />
      </Section>

      <Section title="Appearance">
        <FieldRow cols={2}>
          <Field label="Theme">
            <select
              value={settings.appearance.theme}
              onChange={(e) =>
                patch('appearance', { theme: e.target.value as Settings['appearance']['theme'] })
              }
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">Follow system</option>
            </select>
          </Field>
          <Field label="Corner radius">
            <select
              value={settings.appearance.radiusScale}
              onChange={(e) =>
                patch('appearance', {
                  radiusScale: e.target.value as Settings['appearance']['radiusScale'],
                })
              }
            >
              <option value="sharp">Sharp</option>
              <option value="soft">Soft</option>
              <option value="round">Round</option>
            </select>
          </Field>
        </FieldRow>
        <Field label="Accent" hint="Used for focus rings and highlights.">
          <ColorSwatchPicker
            value={settings.appearance.accent}
            onChange={(accent) => patch('appearance', { accent })}
          />
        </Field>
      </Section>

      <Section
        title="Taxonomy"
        hint="The two classification layers. Projects own stories; tags are shared labels across stories and tasks."
      >
        <div className="row" style={{ gap: 8 }}>
          <button onClick={() => ui.setProjectEditorOpen(true)}>
            Manage projects ({board.projects.length})
          </button>
          <button onClick={() => ui.setTagEditorOpen(true)}>
            Manage tags ({board.tags.length})
          </button>
        </div>
        {orphanTags.length > 0 ? (
          <p className="settings-hint" style={{ marginTop: 9 }}>
            {orphanTags.length} tag label{orphanTags.length > 1 ? 's are' : ' is'} used on items but
            not in the registry — open Manage tags to assign colors.
          </p>
        ) : null}
      </Section>

      <Section
        title="Data"
        hint={
          fileBacked
            ? 'Everything lives in data/board.json. Each save snapshots the previous version first.'
            : 'The board is one Firestore document per workspace. Each save snapshots the version it replaced.'
        }
      >
        <FieldRow cols={2}>
          <Field label="Backup retention" hint="How many snapshots to keep.">
            <input
              type="number"
              min={1}
              max={200}
              value={settings.data.backupRetention}
              onChange={(e) => patch('data', { backupRetention: Number(e.target.value) })}
            />
          </Field>
          <Field
            label="Autosave delay (ms)"
            hint={fileBacked ? 'Debounce before writing to disk.' : 'Debounce before writing to Firestore.'}
          >
            <input
              type="number"
              min={0}
              max={5000}
              step={100}
              value={settings.data.autosaveDelayMs}
              onChange={(e) => patch('data', { autosaveDelayMs: Number(e.target.value) })}
            />
          </Field>
        </FieldRow>

        <div className="row" style={{ gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => {
              void reload().then(() =>
                notify(fileBacked ? 'Reloaded from data/board.json' : 'Reloaded from Firestore'),
              );
            }}
          >
            {fileBacked ? 'Reload from disk' : 'Reload from Firestore'}
          </button>
          <button onClick={loadBackups}>Refresh snapshot list</button>
        </div>

        <h3 className="label" style={{ marginBottom: 6 }}>
          Snapshots ({backups.length})
        </h3>
        {backups.length === 0 ? (
          <div className="settings-hint">No snapshots yet.</div>
        ) : (
          <ul className="backup-list">
            {backups.slice(0, 12).map((b) => (
              <li key={b.name}>
                <span className="mono backup-name">{b.name.replace(/^board\.|\.json$/g, '')}</span>
                <span className="settings-hint">{(b.size / 1024).toFixed(1)} KB</span>
                <button
                  className="tiny"
                  disabled={!canEdit}
                  title={canEdit ? undefined : 'Read-only access'}
                  onClick={() => {
                    if (!confirm(`Restore ${b.name}? Current data is snapshotted first.`)) return;
                    void source
                      ?.restoreBackup(b.name)
                      .then(() => reload())
                      .then(() => {
                        notify('Snapshot restored');
                        loadBackups();
                      })
                      .catch((err) => notify(String(err), 'error'));
                  }}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Confirmations"
        hint="Which destructive actions ask first. Choosing “don’t ask again” in a confirmation dialog switches the matching toggle off here."
      >
        {(Object.keys(CONFIRM_LABELS) as ConfirmKey[]).map((key) => (
          <Toggle
            key={key}
            label={CONFIRM_LABELS[key].label}
            hint={CONFIRM_LABELS[key].hint}
            checked={settings.confirmations[key]}
            onChange={(value) => patch('confirmations', { [key]: value })}
          />
        ))}
      </Section>

      <Section title="Keyboard shortcuts">
        <Toggle
          label="Enable shortcuts"
          checked={settings.shortcuts.enabled}
          onChange={(enabled) => patch('shortcuts', { enabled })}
        />
        <ul className="shortcut-list">
          {hotkeys.map((h) => (
            <li key={h.key}>
              <kbd>{h.key === ' ' ? 'Space' : h.key}</kbd>
              <span>{h.description}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
