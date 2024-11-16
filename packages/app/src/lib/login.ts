export async function login() {
  const token = localStorage.getItem('token')
  if (!token && window.location.pathname !== '/login') {
    window.location.href = `${location.origin}/login`
    throw new Error('Not logged in')
  }
}
