You are a worker on this repo. Add one small feature: a signed-in user (students and the admin alike) can change their password from their account page. Return the full content of each file you change.

Files you may change: `site/js/supa.js` and `site/js/me.js` only.

1. `site/js/supa.js`: export `updatePassword(password)` built the same way as the existing `signIn`/`signUp`/`signOut` helpers (through `authCall`), calling supabase-js v2 `auth.updateUser({ password })`.
2. `site/js/me.js`: in the "Profile" tab (after the profile editor), add a small "Change password" form:
   - Two password inputs, "New password" and "Repeat new password" (`autocomplete="new-password"`, `minlength` 8, required), and a "Change password" submit button.
   - Client checks before the call: at least 8 characters, both fields equal; show the message in a `role="status"` line (use the existing `actionStatus`/`report` helpers from common.js, as other forms in this file do).
   - On success: clear both fields and report "Password changed." On failure: report the service's message (or "Could not change the password. Please try again.").
   - Disable the button while the request runs.
   - Build every node with the existing helpers (`h`, `input`, `label`, `button`, ...); no innerHTML. Reuse existing class names so the current CSS styles it (look at how the profile editor's form is built and match it).
3. Do not change anything else: no data logic, no other exports, no other UI.

In `notes`, say what you added in two lines.
