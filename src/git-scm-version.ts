import { simpleGit } from 'simple-git'

type TTagCountSpec = {
  tag: string
  count: number
}

type TTagDistanceSpec = {
  tag: string
  distance: number
}

export async function buildGitVersion(): Promise<string> {
  const git = simpleGit()

  const tagList: Array<string> = (await git.tag())
    .trim()
    .split('\n')
    .filter((t) => t.match(/^v\d+([.]\d+)*/))

  const counts: Array<TTagCountSpec> = []
  const distances: Array<TTagDistanceSpec> = []
  let headTag: string = ''

  /* If we're on a tag, detect that and short-circuit.
   *
   * Otherwise, find the nearest tag and calculate the extended version.
   *
   * Things are tricky here because rev-list --count --ancestry-path gives
   * zero for BOTH when we're ON the tag, and when the tag is not an ancestor
   * of the current commit.
   *
   * rev-list --count does only give zero for when we're ON the tag, though;
   * it gives a positive number for tags that are not ancestors of HEAD.
   *
   * So, we use an initial rev-list --count check to see if we're on the tag;
   * if not, then we do the full tag list processing, also using
   * --ancestry-path.
   *
   * Note, we're assuming there's at most one version tag on a given commit.
   */

  for (const tag of tagList) {
    const count = parseInt(await git.raw('rev-list', `${tag}..`, '--count'))
    counts.push({ tag: tag, count: count })
  }

  const headTagCountSpec: TTagCountSpec | undefined = counts.find(
    (cSpec) => cSpec.count == 0,
  )

  if (headTagCountSpec !== undefined) {
    // Found it! We're on the version tag
    headTag = headTagCountSpec.tag
  }

  let bareTag: string
  let tagDist: number

  if (headTag !== '') {
    // We're on the version tag
    bareTag = headTag.slice(1)
    tagDist = 0
  } else {
    // We're not on the version tag
    for (const tag of tagList) {
      const distance = parseInt(
        await git.raw('rev-list', `${tag}..`, '--count', '--ancestry-path'),
      )

      if (distance > 0) {
        // Only add tags that are reachable in the history
        distances.push({ tag: tag, distance: distance })
      }
    }

    const nearestDistSpec: TTagDistanceSpec = distances.sort(
      (a, b) => a.distance - b.distance,
    )[0]

    bareTag = nearestDistSpec.tag.slice(1)
    tagDist = nearestDistSpec.distance
  }

  // What commit are we on?
  const sha: string = (await git.raw('rev-parse', '--short', 'HEAD')).trim()

  // Are we clean?
  const clean: boolean = (await git.status()).isClean()

  // What's our timestamp?
  const timestamp: string = timestampFullShort()

  // If we're on the most recent tag and clean, we just return that tag.
  // If we're on the most recent tag and dirty, we return the full string.
  // If we're off the most recent tag and clean, we return the tag and post#?SHA
  // If we're off the most recent tag and dirty, we return the full string.

  // So, dirty always forces the full string.
  // If clean, then what we provide depends on the distance to the latest tag

  if (clean) {
    if (tagDist == 0) {
      return bareTag
    } else {
      return `${bareTag}.post${tagDist}+g${sha}`
    }
  } else {
    return `${bareTag}.post${tagDist}+g${sha}.d${timestamp}`
  }
}

const twoDigit = (val: number): string => {
  return val >= 10 ? `${val}` : `0${val}`
}

const timestampFullShort = (): string => {
  const d = new Date()

  return `${d.getFullYear()}${twoDigit(d.getMonth() + 1)}${twoDigit(d.getDate())}${twoDigit(
    d.getHours(),
  )}${twoDigit(d.getMinutes())}${twoDigit(d.getSeconds())}`
}
