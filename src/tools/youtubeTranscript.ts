import { YoutubeTranscript } from 'youtube-transcript'

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, { type: string; description: string }>
    required: string[]
  }
}

export const toolDef: ToolDefinition = {
  name: 'get_youtube_transcript',
  description:
    'Fetches the full transcript/captions of a YouTube video. Use this whenever a YouTube URL is present in the input.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The full YouTube video URL (e.g. https://www.youtube.com/watch?v=xxxxx)',
      },
    },
    required: ['url'],
  },
}

export async function handler(params: { url: string }): Promise<string> {
  try {
    const segments = await YoutubeTranscript.fetchTranscript(params.url)
    if (!segments || segments.length === 0) {
      return 'No transcript available for this video.'
    }
    return segments.map((s) => s.text).join(' ')
  } catch {
    return 'No transcript available for this video.'
  }
}
