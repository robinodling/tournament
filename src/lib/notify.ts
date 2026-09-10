import { matchLabel } from './label'
import { nextGameFor } from './flow'
import { isReady } from '../state/reducer'
import type { Id, Tournament } from '../types'

/** Per room, per phone: does this player want to be told when their game is ready? Default on. */
const PREF_KEY = (code: string) => `tournament:notify:${code}`

export function loadNotifyPref(code: string): boolean {
  try {
    const raw = localStorage.getItem(PREF_KEY(code))
    return raw === null ? true : raw === '1'
  } catch {
    return true
  }
}

export function saveNotifyPref(code: string, on: boolean): void {
  try {
    localStorage.setItem(PREF_KEY(code), on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function notificationSupport(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export function isIosBrowser(): boolean {
  return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.matchMedia?.('(display-mode: standalone)').matches
}

/** Must be called from a user gesture. */
export async function requestNotificationPermission(): Promise<ReturnType<typeof notificationSupport>> {
  if (notificationSupport() === 'unsupported') return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return notificationSupport()
  }
}

let audio: AudioContext | null = null

/** Browsers only let pages play sound after a user gesture; call this from one. */
export function unlockAudio(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    audio ??= new Ctx()
    if (audio.state === 'suspended') void audio.resume()
  } catch {
    /* ignore */
  }
}

function beep(): void {
  if (!audio || audio.state !== 'running') return
  try {
    const now = audio.currentTime
    for (const [offset, freq] of [
      [0, 880],
      [0.18, 1175],
    ] as const) {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + offset)
      gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16)
      osc.connect(gain).connect(audio.destination)
      osc.start(now + offset)
      osc.stop(now + offset + 0.18)
    }
  } catch {
    /* ignore */
  }
}

export interface GameAlert {
  title: string
  body: string
  tag: string
}

/** System notification (via the service worker when possible), vibration and a beep. */
export async function alertGameReady(alert: GameAlert): Promise<void> {
  try {
    navigator.vibrate?.([200, 100, 200])
  } catch {
    /* ignore */
  }
  beep()
  if (notificationSupport() !== 'granted') return
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    const options: NotificationOptions = { body: alert.body, tag: alert.tag, icon: `${import.meta.env.BASE_URL}icons/icon-192.png` }
    if (reg?.showNotification) await reg.showNotification(alert.title, options)
    else new Notification(alert.title, options)
  } catch {
    /* ignore */
  }
}

/**
 * The game this player could play right now, across group stage, finals and
 * knockout — or null. Used to detect the moment a game becomes available.
 */
export function readyGameFor(t: Tournament, playerId: Id): { id: Id; context: string; arenaId: Id; playerIds: Id[] } | null {
  if (t.phase === 'running') {
    const next = nextGameFor(t, playerId)
    if (next && next.state === 'ready') return { id: next.group.id, context: `Round ${next.roundIndex + 1}`, arenaId: next.group.arenaId, playerIds: next.group.playerIds }
    return null
  }
  if (t.phase === 'final' && t.final) {
    if (t.final.kind === 'bracket' && t.final.bracket) {
      const b = t.final.bracket
      for (let r = 0; r < b.rounds.length; r++) {
        const matches = b.rounds[r]
        for (let i = 0; i < matches.length; i++) {
          const m = matches[i]
          if (isReady(m) && m.playerIds.includes(playerId)) return { id: m.id, context: matchLabel(matches.length, i), arenaId: m.arenaId, playerIds: m.playerIds }
        }
      }
      if (b.bronze && isReady(b.bronze) && b.bronze.playerIds.includes(playerId)) return { id: b.bronze.id, context: 'Bronze match', arenaId: b.bronze.arenaId, playerIds: b.bronze.playerIds }
      return null
    }
    const g = t.final.groups.find((x) => x.playerIds.includes(playerId) && x.result === undefined)
    if (g) return { id: g.id, context: t.final.groups.length > 1 ? `${String.fromCharCode(65 + t.final.groups.indexOf(g))}-final` : 'Final', arenaId: g.arenaId, playerIds: g.playerIds }
  }
  return null
}
