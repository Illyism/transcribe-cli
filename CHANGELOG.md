# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2025-10-06

### Added
- ⚡ **Automatic Optimization**: All files now optimized with 1.2x speed by default
- 99.5% file size reduction (2.7GB → 12.8MB)
- 9% faster processing time
- Automatic SRT timestamp adjustment back to original speed
- New `--raw` flag to disable optimization
- A/B testing suite with baseline, speed, and Opus tests
- Comparison tool with recommendations
- Cursor rules (.mdc) for better codebase navigation

### Changed
- **BREAKING**: Optimization now enabled by default for all files
- Users must use `--raw` flag to get original audio behavior
- Improved configuration error messages with setup links
- Better help text with optimization status

### Performance
- Based on A/B test results with 2.7GB, 22-min video:
  - Baseline: 72s, 15.13 MB
  - Speed (1.2x): 65.4s, 12.81 MB (9% faster, 15% smaller)
  - Opus: 86.8s, 14.27 MB
- Winner: Speed optimization (fastest + smallest)

## [2.0.0] - 2025-10-06

### Added
- 🎥 **YouTube Support**: Download and transcribe YouTube videos directly with just a URL
- Support for youtube.com, youtu.be, and youtube.com/shorts URLs
- Automatic audio-only download for faster processing
- Real-world use case documentation for large video files

### Changed
- **BREAKING**: Package now includes ytdl-core dependency (increases bundle size to ~2MB)
- Improved error messages with links to get API key and setup instructions
- Better configuration documentation with step-by-step guide
- Enhanced comparison table with YouTube support row

### Fixed
- More helpful error message when API key is not configured
- Added verification steps for config file setup

## [1.0.3] - 2025-10-06

### Fixed
- Show actual FFmpeg error output for better debugging
- Added detection for empty/invalid video streams
- Display last 5 lines of FFmpeg output when conversion fails

### Changed
- More informative error messages when FFmpeg fails
- Easier to diagnose issues with corrupted or unsupported video files

## [1.0.2] - 2025-10-06

### Fixed
- Added `"type": "module"` to package.json to eliminate module type detection warning
- Improved FFmpeg error handling with more helpful error messages
- Better error messages for common issues (permissions, missing files, invalid formats)

### Added
- Progress indicators with emoji icons during transcription
- More detailed console output showing each step of the process
- Better FFmpeg installation error messages with platform-specific instructions

## [1.0.1] - 2025-10-06

### Changed
- Added `npx` and `bunx` usage examples to README
- Improved documentation with "Try Without Installing" section
- Better quick start experience for new users

## [1.0.0] - 2025-10-06

### Added
- Initial release
- Transcribe audio and video files to SRT format
- Support for multiple formats: MP4, MP3, WAV, M4A, WebM, OGG, MOV, AVI, MKV
- Automatic audio extraction from video files using FFmpeg
- OpenAI Whisper API integration for high-accuracy transcription
- Automatic language detection
- Precise timestamp generation for subtitles
- Configuration via environment variable or config file (`~/.transcribe/config.json`)
- CLI with help and version commands
- Automatic cleanup of temporary files

### Features
- Fast processing with efficient audio extraction
- Standard SRT subtitle format output
- Multi-language support (powered by Whisper)
- Simple setup and configuration
- Detailed error messages and troubleshooting

### Documentation
- Comprehensive README with examples
- Full publishing guide
- Quick start guide
- MIT License
