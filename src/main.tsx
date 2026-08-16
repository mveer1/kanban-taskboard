import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { WorkspaceProvider } from './store/WorkspaceContext';
import { BoardProvider } from './store/BoardContext';
import { ToastProvider } from './components/ui/Toast';
import { ConfirmProvider } from './components/ui/Confirm';
import { ContextMenuProvider } from './components/ui/ContextMenu';
import './styles/global.css';

/**
 * Provider order matters and is a dependency chain, outermost first:
 *
 *   ToastProvider       no dependencies; everything below can raise a toast
 *   AuthProvider        who is signed in (a synthetic session in local mode)
 *   WorkspaceProvider   which board is open — needs the session
 *   BoardProvider       the data — needs the session and the workspace to pick a
 *                       DataSource
 *   ConfirmProvider     reads and writes settings.confirmations, so it must sit
 *                       inside BoardProvider
 *   ContextMenuProvider menu items call store actions and open confirmations
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <BoardProvider>
            <ConfirmProvider>
              <ContextMenuProvider>
                <App />
              </ContextMenuProvider>
            </ConfirmProvider>
          </BoardProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </ToastProvider>
  </StrictMode>,
);
