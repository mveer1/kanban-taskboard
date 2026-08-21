import type { Profile } from '@/types/board';
import type { SaveState } from '@/store/BoardContext';
import { useBoardStore } from '@/store/BoardContext';
import { UserMenu } from './UserMenu';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import './TopBar.css';

/** Save indicator — makes autosave visible so nothing feels lost. */
function SaveBadge({
  state,
  errors,
  target,
}: {
  state: SaveState;
  errors: string[];
  target: string;
}) {
  const text: Record<SaveState, string> = {
    idle: 'Saved',
    dirty: 'Unsaved changes',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Save failed',
    conflict: 'Refreshed',
  };
  return (
    <span
      className={`save-badge ${state}`}
      title={
        state === 'error' || state === 'conflict'
          ? errors.join('\n')
          : `Autosaves to ${target}`
      }
    >
      <span className="save-dot" />
      {text[state]}
    </span>
  );
}

export function TopBar({
  title,
  subtitle,
  profile,
  saveState,
  saveErrors,
  onOpenSettings,
  onReload,
  actions,
}: {
  title: string;
  subtitle?: string;
  profile: Profile;
  saveState: SaveState;
  saveErrors: string[];
  onOpenSettings: () => void;
  onReload?: () => Promise<void> | void;
  actions?: React.ReactNode;
}) {
  const { source, canEdit } = useBoardStore();

  return (
    <header className="topbar">
      <button
        className="topbar-mobile-brand"
        title="Reload the board"
        onClick={() => {
          void Promise.resolve(onReload?.()).finally(() => window.location.reload());
        }}
      >
        ◧
      </button>
      <div className="topbar-titles">
        <h1>{title}</h1>
        {subtitle ? <div className="topbar-sub">{subtitle}</div> : null}
      </div>

      <div className="topbar-right">
        {/* Viewers keep every read-only control; the write actions are hidden
            by the caller, so state the reason rather than leaving a gap. */}
        {canEdit ? actions : <span className="topbar-readonly">Read-only access</span>}
        {source?.capabilities.workspaces ? <WorkspaceSwitcher /> : null}
        <SaveBadge
          state={saveState}
          errors={saveErrors}
          target={source?.describe ?? 'storage'}
        />
        <UserMenu profile={profile} onOpenSettings={onOpenSettings} />
      </div>
    </header>
  );
}
