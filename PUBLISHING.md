# Publishing Guide for @illyism/transcribe

## Prerequisites

1. **NPM Account**: Sign up at [npmjs.com](https://www.npmjs.com/signup)
2. **NPM Login**: Run `npm login` in your terminal
3. **Package Name**: Make sure `@illyism/transcribe` is available or change it in `package.json`

## Pre-publish Checklist

- [ ] Update version in `package.json` (use semantic versioning)
- [ ] Test the package locally (see Testing section below)
- [ ] Update README.md with any new features
- [ ] Commit all changes to git
- [ ] No API keys or secrets in the code

## Testing Locally

### Test the build

```bash
cd packages/transcribe
bun run build
```

### Test the CLI locally

```bash
# Test with node
node dist/cli.js --help

# Or test with the dev script
bun run dev /path/to/test/file.mp4
```

### Test as a global package

```bash
# Link the package globally
npm link

# Now you can use it anywhere
transcribe --help
transcribe /path/to/test.mp4

# Unlink when done testing
npm unlink -g @illyism/transcribe
```

## Publishing Steps

### 1. Update Version

Follow [Semantic Versioning](https://semver.org/):

- **Patch** (1.0.0 → 1.0.1): Bug fixes
- **Minor** (1.0.0 → 1.1.0): New features (backward compatible)
- **Major** (1.0.0 → 2.0.0): Breaking changes

```bash
# Update version automatically
npm version patch  # or minor, or major

# Or manually edit package.json
```

### 2. Build the Package

```bash
bun run build
```

### 3. Login to NPM

```bash
npm login
```

Enter your credentials when prompted.

### 4. Dry Run (Optional but Recommended)

See what will be published:

```bash
npm publish --dry-run
```

This shows you the files that will be included in the package.

### 5. Publish!

For first-time publishing:

```bash
npm publish --access public
```

For subsequent publishes:

```bash
npm publish
```

### 6. Verify

Check your package on NPM:
- `https://www.npmjs.com/package/@illyism/transcribe`

Try installing it:

```bash
npm install -g @illyism/transcribe
transcribe --version
```

## Publishing a Beta/Alpha Version

For testing before official release:

```bash
# Update version to include tag
npm version 1.1.0-beta.0

# Publish with tag
npm publish --tag beta

# Users can install with
npm install -g @illyism/transcribe@beta
```

## Updating Documentation

After publishing, update:

1. **GitHub Repository**: Push all changes
2. **README.md**: Ensure installation instructions are current
3. **CHANGELOG.md**: Document what changed (create one if needed)

## Troubleshooting

### Package name already taken

Either:
1. Choose a different name in `package.json`
2. Use a scope: `@yourusername/transcribe`

### Permission denied

Make sure you're logged in:
```bash
npm whoami
```

If not logged in:
```bash
npm logout
npm login
```

### Files not included

Check your `.npmignore` file. By default, we include:
- `dist/` (compiled code)
- `README.md`
- `LICENSE`

### Package size too large

NPM has a size limit. Check package size:
```bash
npm pack --dry-run
```

## Unpublishing (Emergency Only)

⚠️ Only unpublish if absolutely necessary (security issue, etc.)

```bash
# Within 72 hours of publishing
npm unpublish @illyism/transcribe@1.0.0

# Unpublish entire package
npm unpublish @illyism/transcribe --force
```

Note: Unpublishing is not recommended and may be prevented by NPM for popular packages.

## Continuous Deployment (Optional)

Set up GitHub Actions for automatic publishing:

Create `.github/workflows/publish.yml`:

```yaml
name: Publish to NPM

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Add your NPM token to GitHub Secrets.

## Support

If you encounter issues:
- NPM support: [npmjs.com/support](https://www.npmjs.com/support)
- Check [NPM status](https://status.npmjs.org/)

## Quick Reference

```bash
# Full publish workflow
npm version patch        # Bump version
bun run build           # Build
npm publish --dry-run   # Verify
npm publish             # Publish!
git push --tags         # Push version tag to git
```
