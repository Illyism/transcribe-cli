import { cancel, confirm, intro, isCancel, log, outro, password } from '@clack/prompts'
import { spawnSync } from 'child_process'
import {
  configPath,
  describeRoute,
  isOpenRouterKey,
  OPENROUTER_BASE_URL,
  PROVIDER_NAMES,
  resolveKeys,
  resolveSettings,
  saveFileConfig,
  type ProviderKeys,
} from './config'

type KeyProvider = keyof ProviderKeys
type KeyStatus = 'valid' | 'invalid' | 'unreachable'

const KEY_URLS: Record<KeyProvider, string> = {
  openai: 'https://platform.openai.com/api-keys',
  openrouter: 'https://openrouter.ai/keys',
}

export async function verifyKey(provider: KeyProvider, key: string): Promise<KeyStatus> {
  const url =
    provider === 'openrouter' ? `${OPENROUTER_BASE_URL}/key` : 'https://api.openai.com/v1/models'
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) return 'valid'
    return res.status === 401 || res.status === 403 ? 'invalid' : 'unreachable'
  } catch {
    return 'unreachable'
  }
}

function maskKey(key: string): string {
  const prefix = isOpenRouterKey(key) ? 'sk-or-' : key.slice(0, 3)
  return `${prefix}…${key.slice(-4)}`
}

async function promptForKey(message: string): Promise<KeyProvider | null> {
  while (true) {
    const answer = await password({
      message,
      validate: (value) => (value?.trim() ? undefined : 'Paste a key, or press Ctrl+C to cancel'),
    })
    if (isCancel(answer)) return null

    const key = answer.trim()
    const provider: KeyProvider = isOpenRouterKey(key) ? 'openrouter' : 'openai'
    const status = await verifyKey(provider, key)

    if (status === 'invalid') {
      log.error(`${PROVIDER_NAMES[provider]} rejected that key. Try again.`)
      continue
    }

    saveFileConfig(provider === 'openrouter' ? { openrouterApiKey: key } : { openaiApiKey: key })
    log.success(
      status === 'valid'
        ? `${PROVIDER_NAMES[provider]} key works`
        : `${PROVIDER_NAMES[provider]} key saved (could not reach the API to check it)`
    )
    return provider
  }
}

/** Interactive key setup. Returns true once at least one key is saved. */
export async function runSetup(): Promise<boolean> {
  intro('transcribe setup')
  log.info(
    'Paste one API key. The provider is detected from the key.\n' +
      `  OpenAI      ${KEY_URLS.openai}\n` +
      `  OpenRouter  ${KEY_URLS.openrouter}`
  )

  const first = await promptForKey('API key')
  if (!first) {
    cancel('Setup cancelled.')
    return false
  }

  const keys = resolveKeys()
  const other: KeyProvider = first === 'openai' ? 'openrouter' : 'openai'
  if (!keys[other]) {
    const addOther = await confirm({
      message:
        other === 'openrouter'
          ? 'Add an OpenRouter key too? Gemini then cleans up every transcript.'
          : 'Add an OpenAI key too? It gives Whisper word-level timing.',
      initialValue: false,
    })
    if (!isCancel(addOther) && addOther) {
      log.info(KEY_URLS[other])
      await promptForKey(`${PROVIDER_NAMES[other]} key`)
    }
  }

  outro(`Saved to ${configPath()}. Try: transcribe video.mp4`)
  return true
}

function hasTool(name: string, versionArg: string): boolean {
  const result = spawnSync(name, [versionArg], { stdio: 'ignore' })
  return !result.error && result.status === 0
}

/** Print what the CLI will actually use: keys, tools, and where each pass goes. */
export async function runDoctor(): Promise<boolean> {
  const keys = resolveKeys()
  let healthy = true

  const providers = ['openai', 'openrouter'] as const
  const statuses = await Promise.all(
    providers.map((provider) => {
      const key = keys[provider]
      return key ? verifyKey(provider, key.value) : undefined
    })
  )

  console.log('\nKeys')
  for (const [i, provider] of providers.entries()) {
    const key = keys[provider]
    const status = statuses[i]
    const name = PROVIDER_NAMES[provider].padEnd(12)
    if (!key || !status) {
      console.log(`  –  ${name}not set`)
      continue
    }
    if (status === 'invalid') healthy = false
    const mark = status === 'valid' ? '✓' : status === 'invalid' ? '✗' : '?'
    console.log(`  ${mark}  ${name}${maskKey(key.value)}  ${status}  (${key.source})`)
  }

  console.log('\nTools')
  for (const [name, arg, note] of [
    ['ffmpeg', '-version', 'required'],
    ['ffprobe', '-version', 'required'],
    ['yt-dlp', '--version', 'only for URLs'],
  ] as const) {
    const found = hasTool(name, arg)
    if (!found && note === 'required') healthy = false
    console.log(`  ${found ? '✓' : '✗'}  ${name.padEnd(8)}${found ? '' : `missing (${note})`}`)
  }

  console.log('\nRouting')
  try {
    const settings = resolveSettings({ autofix: true })
    const autofixOnByDefault = Boolean(resolveSettings().autofixImplicit)
    console.log(`  transcribe  ${describeRoute(settings.transcribe)}`)
    console.log(
      `  autofix     ${settings.autofix ? describeRoute(settings.autofix) : settings.autofixSkipped}` +
        (autofixOnByDefault ? '  (on by default, --no-autofix to skip)' : '  (with --autofix)')
    )
  } catch (err) {
    healthy = false
    console.log(`  ✗  ${err instanceof Error ? err.message : String(err)}`)
  }

  console.log(`\nConfig: ${configPath()}\n`)
  return healthy
}
