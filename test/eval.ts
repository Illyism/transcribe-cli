#!/usr/bin/env bun

import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { transcribe, type TranscribeOptions } from '../src/index'
import {
  appendOpenRouterIdsSection,
  writeEvalResultsJson,
  type OpenRouterGenerationRef,
} from './eval-openrouter-ids'
import { formatEvalError } from './format-eval-error'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const WHISPER_USD_PER_MINUTE = 0.006

type PresetOptions = Pick<TranscribeOptions, 'model' | 'autofix' | 'diarize'>

export interface EvalPreset {
  name: string
  options: PresetOptions
}

// Production default first: no options, so keys and routing resolve exactly as the CLI does
export const EVAL_PRESETS: EvalPreset[] = [
  { name: 'default', options: {} },
  { name: 'whisper-raw', options: { model: 'whisper-1', autofix: false } },
  { name: 'gemini-multimodal', options: { model: 'gemini', autofix: false } },
  { name: 'hybrid-autofix-diarize', options: { model: 'whisper-1', autofix: true } },
]

// Flags: --matrix (all presets) | --models=a,b (subset by name) | none (production default)
// --full benchmarks the full-length recording instead of the short sample
const isMatrix = process.argv.includes('--matrix')
const isFull = process.argv.includes('--full')
const requested = process.argv
  .find((a) => a.startsWith('--models='))
  ?.split('=')[1]
  ?.split(',')
  .map((m) => m.trim().toLowerCase())

const PRESETS = requested
  ? EVAL_PRESETS.filter((p) => requested.some((r) => p.name.includes(r)))
  : isMatrix
    ? EVAL_PRESETS
    : EVAL_PRESETS.slice(0, 1)

interface ApiCall {
  kind: 'chat' | 'transcription'
  model?: string
  requestBytes: number
  inputTokens: number
  audioTokens: number
  outputTokens: number
  reasoningTokens: number
  cost?: number
  generationId?: string
}

// transcribe() does not report usage, so the eval watches the provider calls it makes
let calls: ApiCall[] = []
const realFetch = globalThis.fetch

function bodyBytes(body: unknown): number {
  if (typeof body === 'string') return Buffer.byteLength(body)
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return body.byteLength
  return 0
}

globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : (input?.url ?? String(input))
  const kind = url.includes('/chat/completions')
    ? 'chat'
    : url.includes('/audio/transcriptions')
      ? 'transcription'
      : undefined
  const response = await realFetch(input, init)
  if (!kind) return response

  const call: ApiCall = {
    kind,
    requestBytes: bodyBytes(init?.body),
    inputTokens: 0,
    audioTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
  }
  calls.push(call)
  try {
    const json: any = await response.clone().json()
    call.model = json.model
    call.inputTokens = json.usage?.prompt_tokens ?? 0
    call.audioTokens = json.usage?.prompt_tokens_details?.audio_tokens ?? 0
    call.outputTokens = json.usage?.completion_tokens ?? 0
    call.reasoningTokens = json.usage?.completion_tokens_details?.reasoning_tokens ?? 0
    if (typeof json.usage?.cost === 'number') call.cost = json.usage.cost
    if (typeof json.id === 'string' && json.id.startsWith('gen-')) call.generationId = json.id
  } catch {}
  return response
}) as typeof fetch

interface ResultRow {
  preset: string
  timeMs: number
  durationSeconds?: number
  cues?: number
  chatCalls: number
  requestMB: number
  inputTokens: number
  audioTokens: number
  outputTokens: number
  reasoningTokens: number
  /** Provider-reported LLM cost plus Whisper list price; undefined when unknown */
  cost?: number
  error?: string
  srt?: string
}

function summarize(preset: string, timeMs: number, durationSeconds: number | undefined): ResultRow {
  const chat = calls.filter((c) => c.kind === 'chat')
  const usedWhisper = calls.some((c) => c.kind === 'transcription')
  const chatCostKnown = chat.every((c) => c.cost !== undefined)
  const whisperCost =
    usedWhisper && durationSeconds ? (durationSeconds / 60) * WHISPER_USD_PER_MINUTE : 0

  return {
    preset,
    timeMs,
    durationSeconds,
    chatCalls: chat.length,
    requestMB: chat.reduce((sum, c) => sum + c.requestBytes, 0) / 1024 / 1024,
    inputTokens: chat.reduce((sum, c) => sum + c.inputTokens, 0),
    audioTokens: chat.reduce((sum, c) => sum + c.audioTokens, 0),
    outputTokens: chat.reduce((sum, c) => sum + c.outputTokens, 0),
    reasoningTokens: chat.reduce((sum, c) => sum + c.reasoningTokens, 0),
    cost:
      chatCostKnown && durationSeconds
        ? chat.reduce((sum, c) => sum + (c.cost ?? 0), 0) + whisperCost
        : undefined,
  }
}

async function runEval() {
  const samplePath = path.join(__dirname, 'stitched-sample.m4a')
  const fullPath = path.join(__dirname, 'stitched.m4a')
  const inputAudio = isFull || !existsSync(samplePath) ? fullPath : samplePath

  console.log(`Running ${PRESETS.length} preset(s) on ${path.basename(inputAudio)}...\n`)

  const results: ResultRow[] = []
  const openRouterIds: OpenRouterGenerationRef[] = []

  for (const preset of PRESETS) {
    calls = []
    const srtPath = path.join(__dirname, `eval.${preset.name}.srt`)
    const start = Date.now()

    try {
      const res = await transcribe({ inputPath: inputAudio, outputPath: srtPath, ...preset.options })
      const srt = await fs.readFile(srtPath, 'utf8')
      const cues = srt.split(/\n\s*\n/).filter((b) => b.includes('-->')).length
      if (cues === 0) throw new Error('Transcription returned no cues')

      const row = { ...summarize(preset.name, Date.now() - start, res.duration), cues, srt }
      results.push(row)
      console.log(`✅ ${preset.name} (${(row.timeMs / 1000).toFixed(1)}s, ${cues} cues)`)
    } catch (err) {
      const error = formatEvalError(err)
      results.push({ ...summarize(preset.name, Date.now() - start, undefined), error })
      console.log(`❌ ${preset.name}: ${error}`)
    }

    for (const call of calls) {
      if (!call.generationId) continue
      openRouterIds.push({
        stage: call.kind,
        model: call.model ?? 'unknown',
        caseName: preset.name,
        providerRequestId: call.generationId,
      })
    }
  }

  const md: string[] = []
  md.push('# Transcription Evaluation\n')
  md.push(`Input: \`${path.basename(inputAudio)}\`\n`)
  md.push('## Summary (objective metrics — judge quality from the raw outputs below)\n')
  md.push(
    'Cost = provider-reported LLM cost + Whisper list price ($0.006/min). "Cues" is a count, not a quality score.\n'
  )
  md.push(
    '| Preset | Latency (s) | Media (s) | Cues | LLM calls | Upload (MB) | Tokens in (audio) / out (reasoning) | Cost ($) | Status |'
  )
  md.push('| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |')
  for (const r of results) {
    const tokens = r.chatCalls ? `${r.inputTokens} (${r.audioTokens}) / ${r.outputTokens} (${r.reasoningTokens})` : '—'
    const cost = r.cost === undefined ? '—' : `$${r.cost.toFixed(4)}`
    md.push(
      `| \`${r.preset}\` | ${(r.timeMs / 1000).toFixed(1)} | ${r.durationSeconds?.toFixed(1) ?? '—'} | ${r.cues ?? '—'} | ${r.chatCalls} | ${r.requestMB.toFixed(2)} | ${tokens} | ${cost} | ${r.error ? '❌' : '✅'} |`
    )
  }

  md.push('\n## Raw Outputs\n')
  for (const r of results) {
    md.push(`### \`${r.preset}\`\n`)
    md.push(r.error ? `**Error**: ${r.error}\n` : '```srt\n' + r.srt!.trim() + '\n```\n')
  }

  appendOpenRouterIdsSection(md, openRouterIds)

  const outputPath = path.join(__dirname, 'eval.md')
  await fs.writeFile(outputPath, md.join('\n'), 'utf-8')
  await writeEvalResultsJson(__dirname, {
    runTimestamp: new Date().toISOString(),
    openRouterIds,
    results: results.map(({ srt, ...row }) => row),
  })
  console.log(`\n✅ Results written to ${outputPath}`)
}

runEval().catch(console.error)
