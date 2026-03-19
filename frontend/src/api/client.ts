import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const msg = err.response?.data?.detail || err.message || 'Request failed'
    return Promise.reject(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)))
  }
)

export async function get<T>(path: string): Promise<T> {
  const r = await api.get<T>(path)
  return r.data
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await api.post<T>(path, body)
  return r.data
}

export async function del<T>(path: string): Promise<T> {
  const r = await api.delete<T>(path)
  return r.data
}
