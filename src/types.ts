export interface WhisperWord {
  word: string
  start: number
  end: number
}

export interface WhisperSegment {
  id: number
  seek: number
  start: number
  end: number
  text: string
  tokens: number[]
  temperature: number
  avg_logprob: number
  compression_ratio: number
  no_speech_prob: number
  words?: WhisperWord[]
}

export interface WhisperResponse {
  task: string
  language: string
  duration: number
  text: string
  segments: WhisperSegment[]
}
