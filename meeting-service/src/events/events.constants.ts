/**
 * Jeton d'injection du client RabbitMQ. Isole dans son propre fichier pour la
 * meme raison que dans les autres services : le declarer dans events.module.ts
 * cree une importation circulaire (module -> service -> module), et le jeton
 * vaut alors undefined a l'execution.
 */
export const NOTIFICATIONS_CLIENT = 'NOTIFICATIONS_CLIENT';
