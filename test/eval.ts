#!/usr/bin/env bun

import fs from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { transcribe } from '../src/index'
import { formatEvalError } from './format-eval-error'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface EvalPreset {
  name: string
  model: string
  autofix?: boolean | string
  diarize?: boolean
}

export const EVAL_PRESETS: EvalPreset[] = [
  {
    name: 'whisper-raw',
    model: 'whisper-1',
  },
  {
    name: 'gemini-multimodal',
    model: 'google/gemini-3.7-flash',
  },
  {
    name: 'hybrid-whisper-autofix-diarize',
    model: 'whisper-1',
    autofix: 'google/gemini-3.7-flash',
    diarize: true,
  },
]

function resolveCredentials(model: string): { apiKey: string; baseURL?: string } {
  let fileConfig: { apiKey?: string; baseURL?: string; model?: string } = {}
  try {
    const configPath = path.join(os.homedir(), '.transcribe', 'config.json')
    if (existsSync(configPath)) {
      fileConfig = JSON.parse(readFileSync(configPath, 'utf8'))
    }
  } catch {}

  let envFile: Record<string, string> = {}
  try {
    const envPath = path.join(__dirname, '..', '.env')
    if (existsSync(envPath)) {
      const lines = readFileSync(envPath, 'utf8').split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [k, v] = trimmed.split('=', 2)
          envFile[k.trim()] = v.trim().replace(/^["']|["']$/g, '')
        }
      }
    }
  } catch {}

  const isOpenRouterModel = model.includes('/') || model.startsWith('google/')
  
  if (isOpenRouterModel) {
    const apiKey =
      process.env.OPENROUTER_API_KEY ||
      envFile.OPENROUTER_API_KEY ||
      process.env.OPENAI_API_KEY ||
      envFile.OPENAI_API_KEY ||
      fileConfig.apiKey ||
      ''
    const baseURL =
      process.env.TRANSCRIBE_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      envFile.OPENAI_BASE_URL ||
      fileConfig.baseURL ||
      'https://openrouter.ai/api/v1'
    return { apiKey, baseURL }
  }

  const apiKey =
    process.env.OPENAI_API_KEY ||
    envFile.OPENAI_API_KEY ||
    fileConfig.apiKey ||
    process.env.OPENROUTER_API_KEY ||
    envFile.OPENROUTER_API_KEY ||
    ''
  const baseURL =
    process.env.TRANSCRIBE_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    fileConfig.baseURL ||
    undefined

  return { apiKey, baseURL }
}

async function runEval() {
  const stitchedSamplePath = path.join(__dirname, 'stitched-sample.m4a')
  const stitchedFullPath = path.join(__dirname, 'stitched.m4a')

  // Support flag --full to benchmark full 2h audio, otherwise run on 30s sample for quick feedback
  const isFull = process.argv.includes('--full')
  const inputAudio = isFull && existsSync(stitchedFullPath) ? stitchedFullPath : (existsSync(stitchedSamplePath) ? stitchedSamplePath : stitchedFullPath)

  console.log(`🚀 Running Multi-Pass Evaluation on ${path.basename(inputAudio)}...`)
  console.log(`Presets to test: ${EVAL_PRESETS.map((p) => p.name).join(', ')}\n`)

  const summaryResults: Array<{
    preset: string
    timeMs: number
    duration: number
    status: string
    cuesCount: number
    error?: string
    outputFile?: string
  }> = []

  for (const preset of EVAL_PRESETS) {
    const { apiKey, baseURL } = resolveCredentials(preset.model)
    console.log(`\n🎙️  [Preset: ${preset.name}] Starting transcription...`)
    const start = Date.now()

    const srtPath = path.join(__dirname, `eval.${preset.name}.srt`)
    const mdPath = path.join(__dirname, `eval.${preset.name}.md`)

    try {
      if (!apiKey) {
        throw new Error(`Missing API key for ${preset.name}`)
      }

      const res = await transcribe({
        inputPath: inputAudio,
        outputPath: srtPath,
        apiKey,
        baseURL,
        model: preset.model,
        autofix: preset.autofix,
        diarize: preset.diarize,
        optimize: false, // Keep 1.0x native audio to avoid acoustic distortion
      })

      const timeMs = Date.now() - start
      let srtContent = ''
      if (existsSync(srtPath)) {
        srtContent = await fs.readFile(srtPath, 'utf8')
      }

      const cues = srtContent.split(/\n\s*\n/).filter((b) => b.includes('-->')).length

      const mdContent = [
        `# Evaluation Output: \`${preset.name}\``,
        '',
        `- **Model**: \`${preset.model}\``,
        preset.autofix ? `- **Autofix Model**: \`${preset.autofix}\`` : '',
        preset.diarize ? `- **Speaker Diarization**: Enabled` : '',
        `- **Media Duration**: ${(res.duration / 60).toFixed(2)}m (${res.duration.toFixed(2)}s)`,
        `- **Processing Latency**: ${(timeMs / 1000).toFixed(2)}s`,
        `- **Total SRT Cues**: ${cues}`,
        '',
        '## SRT Subtitles',
        '',
        '```srt',
        srtContent.trim(),
        '```',
        '',
        '## Plaintext',
        '',
        res.text.trim(),
        '',
      ].filter(Boolean).join('\n')

      await fs.writeFile(mdPath, mdContent, 'utf8')

      summaryResults.push({
        preset: preset.name,
        timeMs,
        duration: res.duration,
        cuesCount: cues,
        status: '✅',
        outputFile: mdPath,
      })

      console.log(`✅ [${preset.name}] Finished in ${(timeMs / 1000).toFixed(1)}s! Cues: ${cues}`)
    } catch (err) {
      const timeMs = Date.now() - start
      const error = formatEvalError(err)
      summaryResults.push({
        preset: preset.name,
        timeMs,
        duration: 0,
        cuesCount: 0,
        status: '❌',
        error,
      })
      console.log(`❌ [${preset.name}] Failed: ${error}`)
    }
  }

  console.log('\n' + '═'.repeat(90))
  console.log('📊 MULTI-PASS EVALUATION SUMMARY')
  console.log('═'.repeat(90))
  console.log('| Preset | Status | Latency | Duration | Cues | Output File |')
  console.log('| :--- | :--- | ---: | ---: | ---: | :--- |')
  for (const s of summaryResults) {
    const timeStr = `${(s.timeMs / 1000).toFixed(1)}s`
    const durStr = s.duration ? `${s.duration.toFixed(1)}s` : '—'
    const outStr = s.outputFile ? path.basename(s.outputFile) : s.error || '—'
    console.log(`| \`${s.preset}\` | ${s.status} | ${timeStr} | ${durStr} | ${s.cuesCount} | ${outStr} |`)
  }
  console.log('═'.repeat(90) + '\n')
}

runEval().catch(console.error)
