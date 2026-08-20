import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useBoardStore } from './store/BoardContext';
import { UiProvider, useUi } from './store/UiContext';
import { useWorkspaces } from './store/WorkspaceContext';
import { useAuth } from './auth/AuthContext';
import { LoginScreen } from './auth/LoginScreen';
import { SetupScreen } from './auth/SetupScreen';
import { backendReady, isFirebaseBackend } from './data/backend';
import { filterStories } from './store/selectors';
import { useHotkeys, type Hotkey } from './hooks/useHotkeys';
import { useAppearance } from './hooks/useAppearance';
import { Sidebar, type View } from './components/shell/Sidebar';
import { TopBar } from './components/shell/TopBar';
import { BoardView } from './components/board/Board';
import { StatsPanel } from './components/stats/StatsPanel';
import { InsightsView } from './components/stats/InsightsView';
import { SettingsPage } from './components/settings/SettingsPage';
import { StoryDetailModal } from './components/cards/StoryDetailModal';
import { StoryEditor } from './components/editors/StoryEditor';
import { TaskEditor } from './components/editors/TaskEditor';
import { ProjectEditor } from './components/editors/ProjectEditor';
import { TagEditor } from './components/editors/TagEditor';
import { MembersDialog } from './components/workspace/MembersDialog';
import { AccountDialog } from './components/workspace/AccountDialog';
import './App.css';

const VIEW_META: Record<View, { title: string; subtitle: string }> = {
  board: { title: 'Board', subtitle: 'Projects → Stories → Tasks' },
  insights: { title: 'Insights', subtitle: 'Progress metrics and story dependencies' },
  settings: { title: 'Settings', subtitle: 'Preferences, appearance, and data' },
};

/** Loading and error states before the store has data. */
function Splash({ message, error }: { message: string; error?: boolean }) {
  return (
    <div className={`splash${error ? ' error' : ''}`}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
      >
        {!error && <div className="splash-mark">TB</div>}
        <h1>{error ? 'Could not load the board' : 'Task Board'}</h1>
        <p>{message}</p>
        {!error && <div className="splash-dots"><span /><span /><span /></div>}
        {error && !isFirebaseBackend ? (
          <p className="splash-hint">
            Start the API with <code>npm run dev</code> from the <code>taskboard</code> folder.
          </p>
        ) : null}
        {error && isFirebaseBackend ? (
          <p className="splash-hint">
            Check that Cloud Firestore is enabled and <code>firestore.rules</code> is deployed.
          </p>
        ) : null}
      </motion.div>
    </div>
  );
}

/** Inner shell — runs only once board and settings are loaded. */
function Shell() {
  const store = useBoardStore();
  const ui = useUi();
  const [view, setView] = useState<View>('board');

  const board = store.board!;
  const settings = store.settings!;
  const visible = filterStories(board, ui.filters);
  const canEdit = store.canEdit;

  // Applied here, not in SettingsPage — Shell is always mounted, so the saved
  // theme survives a reload without visiting Settings.
  useAppearance(settings.appearance);

  const hotkeys = useMemo<Hotkey[]>(
    () => [
      { key: 'n', description: 'New story', run: () => canEdit && ui.openStoryEditor({}) },
      {
        key: 't',
        description: 'New task in the first visible story',
        run: () => {
          if (!canEdit) return;
          const target = visible[0] ?? board.stories[0];
          if (target) ui.openTaskEditor({ storyId: target.id });
        },
      },
      {
        key: '/',
        description: 'Focus search',
        run: () => document.getElementById('board-search')?.focus(),
      },
      { key: 'b', description: 'Go to Board', run: () => setView('board') },
      { key: 'g', description: 'Go to Insights (graph)', run: () => setView('insights') },
      { key: ',', description: 'Go to Settings', run: () => setView('settings') },
      { key: 'p', description: 'Manage projects', run: () => ui.setProjectEditorOpen(true) },
      { key: 'l', description: 'Manage tags (labels)', run: () => ui.setTagEditorOpen(true) },
      {
        key: 'e',
        description: 'Expand all task lists',
        run: () => ui.setAllExpanded(board.stories.map((s) => s.id), true),
      },
      { key: 'c', description: 'Collapse all task lists', run: () => ui.setAllExpanded([], false) },
      { key: 'x', description: 'Clear all filters', run: ui.clearFilters },
      {
        key: 'Escape',
        description: 'Close dialogs',
        run: () => {
          ui.closeDetail();
          ui.closeStoryEditor();
          ui.closeTaskEditor();
          ui.setProjectEditorOpen(false);
          ui.setTagEditorOpen(false);
          ui.setMembersOpen(false);
          ui.setAccountOpen(false);
        },
      },
    ],
    [ui, visible, board.stories, canEdit],
  );

  useHotkeys(hotkeys, settings.shortcuts.enabled);

  return (
    <div className="app">
      <Sidebar
        view={view}
        onNavigate={setView}
        profile={settings.profile}
        counts={{ stories: board.stories.length, tasks: board.tasks.length }}
        onReload={store.saveNow}
      />

      <div className="main">
        <TopBar
          title={VIEW_META[view].title}
          subtitle={VIEW_META[view].subtitle}
          profile={settings.profile}
          saveState={store.saveState}
          saveErrors={store.saveErrors}
          onOpenSettings={() => setView('settings')}
          actions={
            view === 'board' ? (
              <>
                <button className="primary" onClick={() => ui.openStoryEditor({})}>
                  + Story
                </button>
                <button className="ghost" onClick={() => ui.setProjectEditorOpen(true)}>
                  Projects
                </button>
                <button className="ghost" onClick={() => ui.setTagEditorOpen(true)}>
                  Tags
                </button>
              </>
            ) : null
          }
        />

        <main className="content">
          {view === 'board' ? (
            <>
              <BoardView />
              {settings.board.showStats ? (
                <section className="board-stats">
                  <h3 className="label">Overview</h3>
                  <StatsPanel board={board} stories={visible} />
                </section>
              ) : null}
            </>
          ) : null}

          {view === 'insights' ? <InsightsView /> : null}
          {view === 'settings' ? <SettingsPage hotkeys={hotkeys} /> : null}
        </main>
      </div>

      {/* Dialogs are mounted once, at the top level. AnimatePresence keeps each
         subtree alive long enough for its exit animation to play. */}
      <AnimatePresence>
        {ui.detailStoryId ? <StoryDetailModal key="detail" /> : null}
        {ui.storyEditor ? <StoryEditor key="story" /> : null}
        {ui.taskEditor ? <TaskEditor key="task" /> : null}
        {ui.projectEditorOpen ? <ProjectEditor key="projects" /> : null}
        {ui.tagEditorOpen ? <TagEditor key="tags" /> : null}
        {ui.membersOpen ? <MembersDialog key="members" /> : null}
        {ui.accountOpen ? <AccountDialog key="account" /> : null}
      </AnimatePresence>
    </div>
  );
}

export function App() {
  const { loading, loadError, board, settings } = useBoardStore();
  const auth = useAuth();
  const workspaces = useWorkspaces();

  // Gate in dependency order: config, then session, then workspace, then data.
  // Each stage needs the previous one, so checking them in any other order shows
  // a misleading message — "loading your board" while actually signed out.

  if (!backendReady()) return <SetupScreen />;

  if (auth.initializing) return <Splash message="Checking your session…" />;
  if (!auth.user) return <LoginScreen />;

  if (workspaces.loading) return <Splash message="Opening your workspaces…" />;
  if (workspaces.error) return <Splash message={workspaces.error} error />;
  if (isFirebaseBackend && !workspaces.active) {
    return <Splash message="No workspace selected." error />;
  }

  if (loading) return <Splash message="Loading your board…" />;
  if (loadError) return <Splash message={loadError} error />;
  if (!board || !settings) return <Splash message="No data available" error />;

  return (
    <UiProvider>
      <Shell />
    </UiProvider>
  );
}
