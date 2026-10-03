import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
export const DEFAULT_OPENAI_MODEL = 'whisper-1'
export const DEFAULT_OPENROUTER_MODEL = 'google/gemini-3.7-flash'
export const DEFAULT_OPENAI_AUTOFIX_MODEL = 'gpt-5.6-luna'

const MODEL_ALIASES: Record<string, string> = {
  gemini: DEFAULT_OPENROUTER_MODEL,
  whisper: DEFAULT_OPENAI_MODEL,
}

export interface FileConfig {
  apiKey?: string
  openaiApiKey?: string
  openrouterApiKey?: string
  baseURL?: string
  model?: string
}

export type Provider = 'openai' | 'openrouter' | 'custom'

export interface KeyInfo {
  value: string
  source: string
}

export interface ProviderKeys {
  openai?: KeyInfo
  openrouter?: KeyInfo
}

export const PROVIDER_NAMES: Record<keyof ProviderKeys, string> = {
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
}

/** Where one request goes: which endpoint and which key. */
export interface Route {
  provider: Provider
  model: string
  apiKey: string
  baseURL?: string
}

export interface Settings {
  transcribe: Route
  autofix?: Route
  /** true when autofix was not requested but turned on because both keys are set */
  autofixImplicit?: boolean
  /** Set when autofix was requested but cannot run with the available keys */
  autofixSkipped?: string
  /** Speaker labels during autofix; off for the implicit pass unless asked for */
  diarize: boolean
}

export interface SettingsInput {
  apiKey?: string
  baseURL?: string
  model?: string
  autofix?: boolean | string
  refineModel?: string
  diarize?: boolean
}

export class MissingKeyError extends Error {
  constructor() {
    super(
      'No API key found. Run `transcribe setup`, or set OPENAI_API_KEY / OPENROUTER_API_KEY.'
    )
    this.name = 'MissingKeyError'
  }
}

export function configPath(): string {
  return join(homedir(), '.transcribe', 'config.json')
}

export function loadFileConfig(): FileConfig {
  try {
    return JSON.parse(readFileSync(configPath(), 'utf8')) as FileConfig
  } catch {
    return {}
  }
}

export function saveFileConfig(patch: FileConfig): string {
  const path = configPath()
  mkdirSync(dirname(path), { recursive: true })
  const next = { ...loadFileConfig(), ...patch }
  writeFileSync(path, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 })
  chmodSync(path, 0o600)
  return path
}

export function isOpenRouterKey(key: string): boolean {
  return key.startsWith('sk-or-')
}

/** Slash ids (google/gemini-...) are chat models; the rest use audio/transcriptions. */
export function isChatModel(model: string): boolean {
  return model.includes('/')
}

export function resolveModelAlias(model?: string): string | undefined {
  if (!model) return undefined
  return MODEL_ALIASES[model.toLowerCase()] ?? model
}

/**
 * Keys are sorted by what they are, not by which variable they came from, so
 * OPENAI_API_KEY=sk-or-... (the old OpenRouter recipe) still lands on OpenRouter.
 */
export function resolveKeys(
  apiKey?: string,
  env: Record<string, string | undefined> = process.env,
  file: FileConfig = loadFileConfig()
): ProviderKeys {
  const candidates: Array<{ value?: string; source: string; openrouter?: boolean }> = [
    { value: apiKey, source: 'apiKey option' },
    { value: env.OPENAI_API_KEY, source: 'OPENAI_API_KEY' },
    { value: env.OPENROUTER_API_KEY, source: 'OPENROUTER_API_KEY', openrouter: true },
    { value: file.openaiApiKey, source: 'config.json' },
    { value: file.openrouterApiKey, source: 'config.json', openrouter: true },
    { value: file.apiKey, source: 'config.json' },
  ]

  const keys: ProviderKeys = {}
  for (const c of candidates) {
    const value = c.value?.trim()
    if (!value) continue
    const provider = c.openrouter || isOpenRouterKey(value) ? 'openrouter' : 'openai'
    if (!keys[provider]) keys[provider] = { value, source: c.source }
  }
  return keys
}

function hostLabel(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * Single source of truth for "which key and endpoint does each pass use".
 * A model with a slash (google/gemini-...) is an OpenRouter model; anything
 * else is an OpenAI model. Each pass gets the key that belongs to its provider.
 */
export function resolveSettings(
  input: SettingsInput = {},
  env: Record<string, string | undefined> = process.env,
  file: FileConfig = loadFileConfig()
): Settings {
  const keys = resolveKeys(input.apiKey, env, file)
  if (!keys.openai && !keys.openrouter) throw new MissingKeyError()

  const rawBaseURL =
    input.baseURL || env.TRANSCRIBE_BASE_URL || env.OPENAI_BASE_URL || file.baseURL
  // Pointing the base URL at OpenRouter just means "use OpenRouter"; it must
  // not drag OpenAI models (and the OpenAI key) over to openrouter.ai.
  const wantsOpenRouter = Boolean(rawBaseURL?.includes('openrouter.ai'))
  const customBaseURL = rawBaseURL && !wantsOpenRouter ? rawBaseURL : undefined

  const route = (requested: string, purpose: 'transcribe' | 'autofix'): Route => {
    // A custom endpoint takes everything except chat-model autofix we can send to OpenRouter
    const autofixOnOpenRouter =
      purpose === 'autofix' && isChatModel(requested) && Boolean(keys.openrouter)
    if (customBaseURL && !autofixOnOpenRouter) {
      return {
        provider: 'custom',
        model: requested,
        apiKey: (keys.openai ?? keys.openrouter)!.value,
        baseURL: customBaseURL,
      }
    }

    // OpenRouter serves OpenAI chat models as openai/<model>
    const model =
      purpose === 'autofix' && !isChatModel(requested) && !keys.openai
        ? `openai/${requested}`
        : requested

    if (isChatModel(model)) {
      if (!keys.openrouter) {
        throw new Error(
          `${model} runs on OpenRouter, but no OpenRouter key is set.\n` +
            'Add one with: transcribe setup'
        )
      }
      return {
        provider: 'openrouter',
        model,
        apiKey: keys.openrouter.value,
        baseURL: OPENROUTER_BASE_URL,
      }
    }

    if (!keys.openai) {
      throw new Error(
        `${model} runs on OpenAI, but only an OpenRouter key is set.\n` +
          'Use --model gemini, or add an OpenAI key with: transcribe setup'
      )
    }
    return { provider: 'openai', model, apiKey: keys.openai.value }
  }

  const requestedModel = resolveModelAlias(input.model || env.TRANSCRIBE_MODEL || file.model)
  const defaultModel =
    customBaseURL || (keys.openai && !(wantsOpenRouter && keys.openrouter))
      ? DEFAULT_OPENAI_MODEL
      : DEFAULT_OPENROUTER_MODEL
  const transcribe = route(requestedModel ?? defaultModel, 'transcribe')

  // With both keys, Whisper timing + Gemini cleanup is the default pipeline
  const autofixImplicit =
    input.autofix === undefined &&
    !input.refineModel &&
    transcribe.provider === 'openai' &&
    Boolean(keys.openrouter)

  const settings: Settings = {
    transcribe,
    diarize: input.diarize ?? !autofixImplicit,
    ...(autofixImplicit ? { autofixImplicit } : {}),
  }

  const pickAutofixModel = (): string | undefined => {
    if (typeof input.autofix === 'string') return resolveModelAlias(input.autofix)
    if (input.autofix === true || autofixImplicit) {
      return keys.openrouter ? DEFAULT_OPENROUTER_MODEL : DEFAULT_OPENAI_AUTOFIX_MODEL
    }
    return input.refineModel
  }

  const autofixModel = pickAutofixModel()
  if (autofixModel) {
    try {
      settings.autofix = route(autofixModel, 'autofix')
    } catch (err) {
      settings.autofixSkipped = err instanceof Error ? err.message : String(err)
    }
  }

  return settings
}

export function describeRoute(route: Route): string {
  const label =
    route.provider === 'custom' ? hostLabel(route.baseURL ?? '') : PROVIDER_NAMES[route.provider]
  return `${route.model} (${label})`
}

export function describeSettings(settings: Settings): string {
  const pass1 = describeRoute(settings.transcribe)
  return settings.autofix ? `${pass1} → autofix ${describeRoute(settings.autofix)}` : pass1
}
