export function paiseToRupees(paise: number): number {
  return paise / 100
}

export function rupeesToPaise(rupees: number | string): number {
  const n = typeof rupees === 'string' ? parseFloat(rupees) : rupees
  return Math.round(n * 100)
}

export function formatPaise(paise: number): string {
  const rupees = paiseToRupees(paise)
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rupees)
}

export function formatCurrency(paise: number): string {
  return '₹' + formatPaise(paise)
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(timestamp: string): string {
  const d = new Date(timestamp)
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}
