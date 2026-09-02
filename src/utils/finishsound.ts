/** Completion chimes played by the transfer queues (plain HTMLAudioElement; guarded for the Node test environment). */
function chime(src: string): () => void {
  const audio = typeof Audio !== 'undefined' ? new Audio(src) : null
  return () => {
    if (!audio || !audio.paused) return
    audio.currentTime = 0
    audio.play().catch(() => {})
  }
}

export const playDownloadFinished = chime('./audio/download_finished.mp3')
export const playUploadFinished = chime('./audio/upload_finished.mp3')
