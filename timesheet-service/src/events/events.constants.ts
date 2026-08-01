/**
 * Jeton d'injection du client RabbitMQ.
 *
 * Volontairement isole dans son propre fichier : le declarer dans
 * events.module.ts creait une importation circulaire (module -> service ->
 * module). TypeScript compilait sans erreur, mais a l'execution le jeton
 * valait undefined et Nest echouait sur
 * "can't resolve dependencies of the EventsService".
 */
export const NOTIFICATIONS_CLIENT = 'NOTIFICATIONS_CLIENT';
