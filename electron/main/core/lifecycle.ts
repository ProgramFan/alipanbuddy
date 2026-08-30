import { app } from 'electron'

type ShutdownHook = () => Promise<void> | void

const SHUTDOWN_TIMEOUT_MS = 3000
const shutdownHooks: ShutdownHook[] = []
let quitting = false
let relaunchArgs: string[] | null = null

/** Register work that must finish (stop aria2c, destroy tray, ...) before the process exits. */
export function onAppShutdown(hook: ShutdownHook): void {
  shutdownHooks.push(hook)
}

/** Quit the whole application: every window, the transfer workers, the tray and the aria2c engine. */
export function quitApp(): void {
  app.quit()
}

/** Quit the whole application and start a fresh instance. */
export function relaunchApp(): void {
  relaunchArgs = process.argv.slice(1).concat(['--relaunch'])
  app.quit()
}

export function isAppQuitting(): boolean {
  return quitting
}

/**
 * `app.quit()` emits `will-quit`; we hold it once, run the shutdown hooks (bounded by a timeout so a
 * hung engine can never keep the process alive) and then terminate with `app.exit()`.
 */
export function registerAppShutdown(): void {
  app.on('will-quit', (event) => {
    if (quitting) return
    quitting = true
    event.preventDefault()
    const runHooks = Promise.allSettled(shutdownHooks.map((hook) => Promise.resolve().then(hook)))
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS))
    Promise.race([runHooks, timeout]).finally(() => {
      if (relaunchArgs) app.relaunch({ args: relaunchArgs })
      app.exit(0)
    })
  })
}
