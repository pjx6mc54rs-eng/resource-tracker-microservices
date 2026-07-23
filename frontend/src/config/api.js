// Vite injects VITE_* values while building the static bundle. In Kubernetes,
// use the current ingress origin so requests remain on the same host and port.
const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:3005')

export default API_URL
