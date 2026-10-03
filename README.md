# SOJOURN

Top-down space game built with strict TypeScript and Vite.

## Local start

The root `index.html` is a Vite application entry point. Do **not** open it directly with a `file://` URL: the browser does not compile the TypeScript source or provide Vite's module/asset pipeline.

On Windows, double-click:

`start-sojourn.cmd`

It installs dependencies on the first run and starts the local development server with the browser opened automatically.

Alternatively:

```bash
npm install
npm run start
```

For a production build:

```bash
npm run build
npm run preview
```

## Quality gate

Run:

```bash
npm run check
```

This checks formatting, linting, strict TypeScript, architecture dependencies, tests, and the production build.
