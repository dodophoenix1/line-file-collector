# LINE File Collector - Project & Deployment Guidelines

## ⚠️ CRITICAL DEPLOYMENT & RENDER ACCOUNT INFORMATION (ALWAYS REMIND USER)
Whenever the user asks about deploying this project, where it is hosted, which account to log in to, or Render status, ALWAYS immediately remind the user of the following:

1. **Production URL**: `https://line-file-collector.onrender.com` (DO NOT confuse with or mention demo services).
2. **Render Account**:
   - **Email**: `nattasit_v@fangwit.ac.th` (Login via "Sign in with Google" ➔ choose this school email, Avatar is Yellow 'N').
   - **DO NOT** use `dodophoenix1@gmail.com` or `admin@fangwit.ac.th` on Render (they have 0 services and will cause confusion).
   - **DO NOT** click "Sign in with GitHub" on Render (the GitHub account `dodophoenix1` is linked for deployment repository access only, not as a login method).
3. **Location in Render Dashboard**:
   - Workspace: `nattasit's workspace`
   - Navigation: Click **`Projects`** on the left ➔ **`My project`** ➔ **`Production`** ➔ **`line-file-collector`**
   - Shortcut: Press `Cmd + K` on Render and search for `line-file-collector`.
4. **Deployment Workflow**:
   - Local edits ➔ Push to GitHub: `https://github.com/dodophoenix1/line-file-collector` (`main` branch).
   - Inside Render `line-file-collector` ➔ Click **`Manual Deploy`** ➔ **`Deploy latest commit`**.
5. **Key Credentials & Settings**:
   - Teacher Dashboard PIN: `fw2569`
   - Admin Login Password: `admin123`
   - Default Theme: Light Mode (`light`), with Dark Mode toggle button.
