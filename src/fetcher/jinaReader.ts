import axios from 'axios'
import { isSocialMediaUrl, fetchWithApify } from './apifyFetcher.js'

export async function fetchUrl(url: string): Promise<string> {
  try {
    new URL(url)
  } catch {
    throw new Error(`Invalid URL: ${url}`)
  }

  if (isSocialMediaUrl(url)) {
    return fetchWithApify(url)
  }

  try {
    const response = await axios.get<string>(`https://r.jina.ai/${url}`, {
      timeout: 20000,
      responseType: 'text',
    })
    return response.data
  } catch {
    try {
      const retry = await axios.get<string>(`https://r.jina.ai/${url}`, {
        timeout: 30000,
        responseType: 'text',
      })
      return retry.data
    } catch {
      return url
    }
  }
}
