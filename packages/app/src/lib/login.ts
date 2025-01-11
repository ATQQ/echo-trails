export async function login() {
  const token = localStorage.getItem('token')
  if (!token && window.location.pathname !== '/login') {
    throw new Error('Not logged in')
  }
}

export function goLogin() {
  window.location.href = `${location.origin}/login`
}
