import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_OPENROUTER_MODEL,
  MissingKeyError,
  OPENROUTER_BASE_URL,
  describeSettings,
  resolveKeys,
  resolveSettings,
} from './config'

const OPENAI = 'sk-proj-openai'
const OPENROUTER = 'sk-or-v1-openrouter'
const both = { openaiApiKey: OPENAI, openrouterApiKey: OPENROUTER }

describe('resolveKeys', () => {
  test('sorts keys by prefix, not by variable name', () => {
    const keys = resolveKeys(undefined, { OPENAI_API_KEY: OPENROUTER }, {})
    expect(keys.openrouter?.value).toBe(OPENROUTER)
    expect(keys.openai).toBeUndefined()
  })

  test('env wins over config file', () => {
    const keys = resolveKeys(undefined, { OPENAI_API_KEY: 'sk-env' }, both)
    expect(keys.openai).toEqual({ value: 'sk-env', source: 'OPENAI_API_KEY' })
    expect(keys.openrouter?.value).toBe(OPENROUTER)
  })

  test('legacy apiKey field is classified', () => {
    expect(resolveKeys(undefined, {}, { apiKey: OPENROUTER }).openrouter?.value).toBe(OPENROUTER)
    expect(resolveKeys(undefined, {}, { apiKey: OPENAI }).openai?.value).toBe(OPENAI)
  })
})

describe('resolveSettings', () => {
  test('no keys throws MissingKeyError', () => {
    expect(() => resolveSettings({}, {}, {})).toThrow(MissingKeyError)
  })

  test('both keys: whisper on OpenAI, autofix on OpenRouter', () => {
    const s = resolveSettings({ autofix: true }, {}, both)
    expect(s.transcribe).toMatchObject({ provider: 'openai', model: 'whisper-1', apiKey: OPENAI })
    expect(s.transcribe.baseURL).toBeUndefined()
    expect(s.autofix).toMatchObject({
      provider: 'openrouter',
      model: DEFAULT_OPENROUTER_MODEL,
      apiKey: OPENROUTER,
      baseURL: OPENROUTER_BASE_URL,
    })
    expect(describeSettings(s)).toBe(
      'whisper-1 (OpenAI) → autofix google/gemini-3.7-flash (OpenRouter)'
    )
  })

  test('both keys + gemini model uses the OpenRouter key', () => {
    const s = resolveSettings({ model: 'google/gemini-3.7-flash' }, {}, both)
    expect(s.transcribe).toMatchObject({ provider: 'openrouter', apiKey: OPENROUTER })
    expect(s.autofix).toBeUndefined()
  })

  test('both keys: autofix is on by default, off with autofix: false', () => {
    const s = resolveSettings({}, {}, both)
    expect(s.autofix).toMatchObject({ provider: 'openrouter', model: DEFAULT_OPENROUTER_MODEL })
    expect(s.autofixImplicit).toBe(true)
    expect(s.diarize).toBe(false)
    expect(resolveSettings({ diarize: true }, {}, both).diarize).toBe(true)
    expect(resolveSettings({ autofix: true }, {}, both).diarize).toBe(true)
    expect(resolveSettings({ autofix: false }, {}, both).autofix).toBeUndefined()
    expect(resolveSettings({ autofix: true }, {}, both).autofixImplicit).toBeUndefined()
  })

  test('one key: autofix stays opt-in', () => {
    expect(resolveSettings({}, {}, { apiKey: OPENAI }).autofix).toBeUndefined()
    expect(resolveSettings({}, {}, { apiKey: OPENROUTER }).autofix).toBeUndefined()
  })

  test('gemini alias', () => {
    expect(resolveSettings({ model: 'gemini' }, {}, both).transcribe.model).toBe(DEFAULT_OPENROUTER_MODEL)
  })

  test('OPENAI_BASE_URL pointing at OpenRouter does not hijack whisper', () => {
    const s = resolveSettings({ model: 'whisper-1', autofix: false }, { OPENAI_BASE_URL: OPENROUTER_BASE_URL }, both)
    expect(s.transcribe).toMatchObject({ provider: 'openai', apiKey: OPENAI })
    expect(s.transcribe.baseURL).toBeUndefined()
  })

  test('OpenRouter base URL with both keys defaults to Gemini', () => {
    const s = resolveSettings({}, { OPENAI_BASE_URL: OPENROUTER_BASE_URL }, both)
    expect(s.transcribe).toMatchObject({ provider: 'openrouter', model: DEFAULT_OPENROUTER_MODEL })
  })

  test('OpenRouter only: gemini for both passes', () => {
    const s = resolveSettings({ autofix: true }, { OPENROUTER_API_KEY: OPENROUTER }, {})
    expect(s.transcribe).toMatchObject({ provider: 'openrouter', model: DEFAULT_OPENROUTER_MODEL })
    expect(s.autofix?.provider).toBe('openrouter')
  })

  test('OpenRouter only: OpenAI autofix model is served via openai/ prefix', () => {
    const s = resolveSettings({ autofix: 'gpt-5.6-luna' }, {}, { apiKey: OPENROUTER })
    expect(s.autofix).toMatchObject({ provider: 'openrouter', model: 'openai/gpt-5.6-luna' })
  })

  test('OpenRouter only + whisper-1 explains the fix', () => {
    expect(() => resolveSettings({ model: 'whisper-1' }, {}, { apiKey: OPENROUTER })).toThrow(
      /--model gemini/
    )
  })

  test('OpenAI only: gemini model explains the fix, gemini autofix is skipped', () => {
    expect(() => resolveSettings({ model: 'gemini' }, {}, { apiKey: OPENAI })).toThrow(/transcribe setup/)
    const s = resolveSettings({ autofix: 'google/gemini-3.7-flash' }, {}, { apiKey: OPENAI })
    expect(s.autofix).toBeUndefined()
    expect(s.autofixSkipped).toMatch(/OpenRouter/)
  })

  test('OpenAI only: autofix defaults to gpt on OpenAI', () => {
    const s = resolveSettings({ autofix: true }, {}, { apiKey: OPENAI })
    expect(s.autofix).toMatchObject({ provider: 'openai', model: 'gpt-5.6-luna', apiKey: OPENAI })
  })

  test('custom base URL (Groq) keeps pass 1 there, autofix still goes to OpenRouter', () => {
    const s = resolveSettings(
      { model: 'whisper-large-v3', baseURL: 'https://api.groq.com/openai/v1', autofix: true },
      {},
      { apiKey: 'gsk_groq', openrouterApiKey: OPENROUTER }
    )
    expect(s.transcribe).toMatchObject({
      provider: 'custom',
      apiKey: 'gsk_groq',
      baseURL: 'https://api.groq.com/openai/v1',
    })
    expect(describeSettings(s)).toMatch(/^whisper-large-v3 \(api\.groq\.com\)/)
    expect(s.autofix).toMatchObject({ provider: 'openrouter', apiKey: OPENROUTER })
  })
})
