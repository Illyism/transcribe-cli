# Quick Start: Publishing to NPM

## 🚀 Ready to Publish in 5 Steps

### 1. Check Package Name Availability

```bash
npm view @illyism/transcribe
```

If it's taken, update the name in `package.json` to something unique like:
- `@yourusername/transcribe`
- `transcribe-cli`
- `whisper-transcribe`

### 2. Login to NPM

```bash
npm login
```

Don't have an account? Sign up at [npmjs.com/signup](https://www.npmjs.com/signup)

### 3. Test Locally (Optional but Recommended)

```bash
cd /Users/illyism/Products/magicspace/magicspace-old/packages/transcribe

# Build
bun run build

# Test
node dist/cli.js --help

# Test with a real file
node dist/cli.js /path/to/test.mp4
```

### 4. Dry Run

See what will be published:

```bash
npm publish --dry-run
```

### 5. Publish!

```bash
npm publish --access public
```

✅ Done! Your package is now live on NPM!

## Verify It Worked

Install globally and test:

```bash
npm install -g @illyism/transcribe
transcribe --version
transcribe --help
```

## Update Later

When you want to release a new version:

```bash
# Update version (patch for bug fixes, minor for features, major for breaking changes)
npm version patch

# Build and publish
bun run build
npm publish

# Push the version tag to git
git push --tags
```

## Current Package Structure

```
packages/transcribe/
├── src/
│   └── cli.ts          # Source code
├── dist/
│   └── cli.js          # Built executable
├── package.json        # Package metadata
├── README.md          # User documentation
├── LICENSE            # MIT License
├── PUBLISHING.md      # Detailed publishing guide
├── QUICKSTART.md      # This file
└── tsconfig.json      # TypeScript config
```

## What Users Will Get

After publishing, users can:

```bash
# Install globally
npm install -g @illyism/transcribe

# Use anywhere
transcribe video.mp4
transcribe audio.mp3

# Configure API key (OpenAI or OpenRouter, auto-detected)
transcribe setup

# Or use an environment variable
export OPENAI_API_KEY=sk-...
```

## Need Help?

- **Detailed guide**: See `PUBLISHING.md`
- **NPM docs**: [docs.npmjs.com](https://docs.npmjs.com)
- **Package issues**: Open issue on GitHub
