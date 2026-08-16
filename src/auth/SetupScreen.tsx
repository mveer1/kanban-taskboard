import { backendConfigProblems } from '@/data/backend';
import './LoginScreen.css';
import './SetupScreen.css';

/**
 * Shown when the firebase backend is selected but the credentials are still
 * placeholders — which is the state of a fresh clone.
 *
 * This exists because the alternative is worse: the Firebase SDK throws
 * `auth/invalid-api-key` from inside a promise on the first call, which surfaces
 * as a blank page and a console trace. A checklist is a better first run.
 */
export function SetupScreen() {
  const missing = backendConfigProblems();

  return (
    <div className="login-screen">
      <div className="login-card setup-card">
        <header className="login-head">
          <div className="login-mark">TB</div>
          <h1>Finish Firebase setup</h1>
          <p>
            This build targets the Firebase backend, but the config values are still
            placeholders.
          </p>
        </header>

        <ol className="setup-steps">
          <li>
            Create a project at <code>console.firebase.google.com</code>, then add a
            <strong> Web app</strong> to it.
          </li>
          <li>
            Enable <strong>Authentication</strong> → Google, GitHub, Email/Password, and
            Anonymous.
          </li>
          <li>
            Create a <strong>Cloud Firestore</strong> database, then deploy
            <code>firestore.rules</code>.
          </li>
          <li>
            Copy <code>.env.example</code> to <code>.env.local</code> and paste the config
            values in.
          </li>
        </ol>

        {missing.length > 0 ? (
          <div className="setup-missing">
            <h2>Still needed</h2>
            <ul>
              {missing.map((name) => (
                <li key={name}><code>{name}</code></li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="login-hint">
          Deploying to GitHub Pages? The same values go in as repository secrets — see
          <code> DEPLOYMENT.md</code>. To work offline instead, run <code>npm run dev</code>,
          which uses the local file backend and needs no Firebase project.
        </p>
      </div>
    </div>
  );
}
