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
    el.currentTime = 0

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
}
