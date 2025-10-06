# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
