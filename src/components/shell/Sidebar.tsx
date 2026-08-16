import type { Profile } from '@/types/board';
import './Sidebar.css';

/**
 * Left navigation. Views are local state in App.tsx rather than routes —
 * swap this for a router when the app moves to a real host.
 */

export type View = 'board' | 'insights' | 'settings';

const NAV: Array<{ id: View; label: string; icon: string; hint: string }> = [
  { id: 'board', label: 'Board', icon: '▤', hint: 'Stories and tasks' },
  { id: 'insights', label: 'Insights', icon: '◔', hint: 'Stats and dependencies' },
  { id: 'settings', label: 'Settings', icon: '⚙', hint: 'Preferences and data' },
];

export function Sidebar({
  view,
  onNavigate,
  profile,
  counts,
  onReload,
}: {
  view: View;
  onNavigate: (v: View) => void;
  profile: Profile;
  counts: { stories: number; tasks: number };
  /** Flush pending edits before the reload discards them. */
  onReload?: () => Promise<void> | void;
}) {
  return (
    <aside className="sidebar">
      {/*
        Reloads rather than resetting state: the point is to re-read the board
        from storage, which is the useful escape hatch when the file was edited
        outside the app or a collaborator's change did not arrive.
        Autosave is debounced, so flush anything pending first.
      */}
      <button
        className="brand"
        title="Reload the board"
        onClick={() => {
          void Promise.resolve(onReload?.()).finally(() => window.location.reload());
        }}
      >
        <span className="brand-mark">◧</span>
        <span className="brand-name">Task Board</span>
      </button>

      <nav className="nav">
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`nav-item${view === item.id ? ' on' : ''}`}
            onClick={() => onNavigate(item.id)}
            title={item.hint}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="sidebar-counts">
          <span>{counts.stories} stories</span>
          <span>{counts.tasks} tasks</span>
        </div>
        <div className="sidebar-user">
          <span className="avatar sm" style={{ background: profile.avatarColor }}>
            {profile.initials}
          </span>
          <span className="sidebar-user-name">{profile.name}</span>
        </div>
      </div>
    </aside>
  );
}
