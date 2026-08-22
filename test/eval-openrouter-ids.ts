export interface OpenRouterGenerationRef {
  stage: string
  model: string
  caseName: string
  providerRequestId: string
}

export interface EvalResultsJson {
  runTimestamp: string
  featureModel?: string
  openRouterIds: OpenRouterGenerationRef[]
  results: any[]
}

export function extractProviderRequestId(result: any): string | undefined {
  if (!result) return undefined
  if (typeof result.providerRequestId === 'string') return result.providerRequestId
  if (typeof result._request_id === 'string') return result._request_id
  if (typeof result.id === 'string' && result.id.startsWith('gen-')) return result.id
  if (result.headers && typeof result.headers.get === 'function') {
    const id = result.headers.get('x-openrouter-generation-id') || result.headers.get('openrouter-generation-id')
    if (id) return id
  }
  return undefined
}

export function collectOpenRouterIds(
  entries: Array<OpenRouterGenerationRef | undefined | null>
): OpenRouterGenerationRef[] {
  return entries.filter((e): e is OpenRouterGenerationRef => Boolean(e && e.providerRequestId))
}

export function appendOpenRouterIdsSection(
  md: string[],
  openRouterIds: OpenRouterGenerationRef[]
): void {
  md.push('\n## OpenRouter Generation IDs\n')
  if (openRouterIds.length === 0) {
    md.push('*No OpenRouter generation IDs captured for this run.* (Provider note: direct OpenAI or non-OpenRouter endpoints do not emit OpenRouter IDs)\n')
    return
  }

  md.push('| Stage | Model | Test Case | Generation ID | Inspect Link |')
  md.push('| :--- | :--- | :--- | :--- | :--- |')
  for (const item of openRouterIds) {
    const link = `[Inspect](https://openrouter.ai/api/v1/generation?id=${item.providerRequestId})`
    md.push(`| ${item.stage} | \`${item.model}\` | ${item.caseName} | \`${item.providerRequestId}\` | ${link} |`)
  }
  md.push('')
}

export async function writeEvalResultsJson(
  dir: string,
  data: EvalResultsJson
): Promise<void> {
  const fs = await import('fs/promises')
  const path = await import('path')
  const filePath = path.join(dir, 'eval-results.json')
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}
