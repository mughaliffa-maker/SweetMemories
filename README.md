# The Sweet Crumbs CrumbCam

Interactive cookie filter website for The Sweet Crumbs packaging QR experience.

## Files

- `index.html` is the main website file.
- `css/styles.css` contains the full UI design.
- `js/script.js` contains camera, eye tracking, snap, share, and download logic.
- `assets/cookie.png` is the cookie filter image.

## How to run in VS Code

1. Open this folder in VS Code.
2. Install the **Live Server** extension.
3. Right click `index.html`.
4. Click **Open with Live Server**.
5. Allow camera permission in the browser.

Camera access works on `localhost` or HTTPS. It may not work by directly opening the file with `file://`.

## Packaging QR use

After uploading this folder to Netlify, Vercel, GitHub Pages, or any HTTPS hosting, create a QR code from the hosted link and place it on the cookie packaging.


## Vercel deploy settings

This version has no external npm dependencies. Vercel only runs `npm run build`, which copies the static files into `public`.

Use these settings if Vercel asks:
- Framework Preset: Other
- Build Command: npm run build
- Output Directory: public
- Install Command: npm install

Important: `index.html`, `package.json`, `vercel.json`, `build.js`, `assets`, `css`, and `js` must be at the repository root.
