/**
 * Son joué à l'arrivée d'une nouvelle notification.
 *
 * Volontairement hors de tout composant : aucune dépendance à React, donc
 * testable seul et réutilisable ailleurs (chat, alertes…).
 *
 * Pour remplacer le son, il suffit de déposer un fichier dans `public/` et de
 * changer SOUND_URL ci-dessous. Un `.mp3` fonctionne aussi bien qu'un `.wav`.
 */

const SOUND_URL = '/notification.wav'

// Une seule instance Audio pour toute l'application. En créer une par
// notification laisserait s'accumuler des objets audio jamais libérés, et
// forcerait un téléchargement du fichier à chaque fois.
let audio = null

// Les navigateurs bloquent la lecture automatique tant que l'utilisateur n'a
// pas interagi avec la page. Inutile de réessayer indéfiniment et de polluer la
// console : on ne prévient qu'une fois.
let autoplayBlockedLogged = false

function getAudio() {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    return null
  }
  if (!audio) {
    audio = new Audio(SOUND_URL)
    audio.preload = 'auto'
    audio.volume = 0.45
  }
  return audio
}

/**
 * Joue le son. Ne lève jamais d'exception : un échec de lecture ne doit pas
 * interrompre l'affichage des notifications.
 */
export function playNotificationSound() {
  const el = getAudio()
  if (!el) return

  try {
    // Remise à zéro avant lecture : sans elle, un appel pendant que le son
    // joue encore est ignoré par le navigateur. C'est ce qui permet à des
    // notifications rapprochées de déclencher le son à chaque fois.
    //
    // Le garde sur readyState est indispensable : écrire currentTime sur un
    // média encore non chargé lève InvalidStateError sur plusieurs
    // navigateurs. Sans lui, l'exception nous faisait sortir avant même
    // d'appeler play() — donc aucun son, jamais, au premier déclenchement.
    if (el.readyState > 0) {
      try {
        el.currentTime = 0
      } catch {
        // Média pas encore prêt : on joue depuis sa position actuelle.
      }
    }

    const result = el.play()
    // play() ne renvoie une promesse que sur les navigateurs récents.
    if (result && typeof result.catch === 'function') {
      result.catch((error) => {
        if (!autoplayBlockedLogged) {
          autoplayBlockedLogged = true
          console.info(
            '[notifications] Son non joué (lecture automatique bloquée par le navigateur).',
            error?.name ?? error,
          )
        }
      })
    }
  } catch (error) {
    if (!autoplayBlockedLogged) {
      autoplayBlockedLogged = true
      console.info('[notifications] Son indisponible :', error?.message ?? error)
    }
  }
}

/**
 * Précharge le fichier après la première interaction de l'utilisateur.
 * Appelé au montage : à ce moment la lecture est autorisée, et le son sera
 * déjà en cache lors de la première notification.
 */
export function primeNotificationSound() {
  const el = getAudio()
  if (!el) return
  try {
    el.load()
  } catch {
    // Un préchargement raté n'empêche pas la lecture ultérieure.
  }
  unlockOnFirstGesture()
}

// Déverrouillage audio : les navigateurs n'autorisent la lecture qu'après une
// interaction de l'utilisateur. On profite du tout premier clic ou appui
// clavier pour lancer puis stopper immédiatement le son — inaudible, mais le
// média est dès lors considéré comme « débloqué » et les lectures suivantes,
// déclenchées par du code, passent sans être refusées.
let unlockBound = false

function unlockOnFirstGesture() {
  if (unlockBound || typeof document === 'undefined') return
  unlockBound = true

  const unlock = () => {
    const el = getAudio()
    if (!el) return
    const previousVolume = el.volume
    try {
      el.volume = 0
      const result = el.play()
      if (result && typeof result.then === 'function') {
        result
          .then(() => {
            el.pause()
            try {
              el.currentTime = 0
            } catch {
              // sans importance : le média est déjà débloqué
            }
            el.volume = previousVolume
          })
          .catch(() => {
            el.volume = previousVolume
          })
      } else {
        el.pause()
        el.volume = previousVolume
      }
    } catch {
      el.volume = previousVolume
    }
    document.removeEventListener('pointerdown', unlock)
    document.removeEventListener('keydown', unlock)
  }

  document.addEventListener('pointerdown', unlock, { once: true })
  document.addEventListener('keydown', unlock, { once: true })
}
