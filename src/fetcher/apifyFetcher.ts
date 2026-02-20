import { ApifyClient } from 'apify-client'
import { config } from '../config.js'

export const APIFY_DOMAINS = [
  'facebook.com',
  'www.facebook.com',
  'fb.watch',
  'instagram.com',
  'www.instagram.com',
  // 'threads.com',
  // 'www.threads.com',
  // 'threads.net',
  // 'www.threads.net',
  // 'reddit.com',
  // 'www.reddit.com',
]

export function isSocialMediaUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return APIFY_DOMAINS.includes(hostname)
  } catch {
    return false
  }
}

function getClient(): ApifyClient {
  return new ApifyClient({ token: config.APIFY_TOKEN })
}

export async function fetchWithApify(url: string): Promise<string> {
  try {
    const { hostname } = new URL(url)
    const client = getClient()

    if (hostname === 'facebook.com' || hostname === 'www.facebook.com' || hostname === 'fb.watch') {
      return await fetchFacebook(client, url)
    }

    if (hostname === 'instagram.com' || hostname === 'www.instagram.com') {
      return await fetchInstagram(client, url)
    }

    // Threads / Reddit are temporarily disabled because the currently selected
    // Apify actors for these sources are paid in our setup.
    // if (hostname === 'threads.com' || hostname === 'www.threads.com' ||
    //     hostname === 'threads.net' || hostname === 'www.threads.net') {
    //   return await fetchThreads(client, url)
    // }
    //
    // if (hostname === 'reddit.com' || hostname === 'www.reddit.com') {
    //   return await fetchReddit(client, url)
    // }

    return url
  } catch {
    return url
  }
}

async function fetchFacebook(client: ApifyClient, url: string): Promise<string> {
  try {
    const run = await client.actor('apify/facebook-posts-scraper').call({
      startUrls: [{ url }],
      resultsLimit: 1,
      captionText: true,
    })
    const { items } = await client.dataset(run.defaultDatasetId).listItems()
    if (!items || items.length === 0) return url
    const post = items[0] as Record<string, any>
    const author = post.user?.name ?? post.pageName ?? post.author ?? '未知作者'
    const text = post.text ?? post.caption ?? post.captionText ?? post.message ?? ''
    return `【FB 貼文】\n作者：${author}\n內文：\n${text}`
  } catch {
    return url
  }
}

async function fetchInstagram(client: ApifyClient, url: string): Promise<string> {
  try {
    const run = await client.actor('apify/instagram-post-scraper').call({
      addrs: [url],
    })
    const { items } = await client.dataset(run.defaultDatasetId).listItems()
    if (!items || items.length === 0) return url
    const post = items[0] as Record<string, any>
    return `【IG 貼文】\n內文：${post.caption ?? ''}`
  } catch {
    return url
  }
}

// async function fetchThreads(client: ApifyClient, url: string): Promise<string> {
//   try {
//     const run = await client.actor('apify/instagram-post-scraper').call({
//       addrs: [url],
//     })
//     const { items } = await client.dataset(run.defaultDatasetId).listItems()
//     if (!items || items.length === 0) return url
//     const post = items[0] as Record<string, any>
//     return `【Threads 貼文】\n內文：${post.caption ?? post.text ?? ''}`
//   } catch {
//     return url
//   }
// }
//
// async function fetchReddit(client: ApifyClient, url: string): Promise<string> {
//   try {
//     const run = await client.actor('trudax/reddit-scraper-lite').call({
//       startUrls: [{ url }],
//       maxItems: 1,
//     })
//     const { items } = await client.dataset(run.defaultDatasetId).listItems()
//     if (!items || items.length === 0) return url
//     const post = items[0] as Record<string, any>
//     const title = post.title ?? ''
//     const body = post.body ?? post.selftext ?? ''
//     return `【Reddit 貼文】\n標題：${title}\n內文：\n${body}`
//   } catch {
//     return url
//   }
// }
