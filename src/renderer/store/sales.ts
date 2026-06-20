import { create } from 'zustand'
import { SALE_TYPES, PAYMENT_METHODS } from '@/utils/constants'

export interface CartItem {
  id: string
  productId?: number
  name: string
  type: 'cylinder' | 'accessory'
  qty: number
  unitPrice: number   // paise
}

export interface PaymentRow {
  id: string
  method: string
  amount: number      // paise
}

export interface CustomerInfo {
  name: string
  consumerNumber: string
  otp: string
  phone: string
  noOtp: boolean
}

export interface SaleState {
  cart: CartItem[]
  customer: CustomerInfo
  saleType: string
  emptyReceived: string
  emptyCount: number
  payments: PaymentRow[]
  saleDiscount: number

  addToCart: (item: Omit<CartItem, 'id'>) => void
  removeFromCart: (id: string) => void
  updateCartQty: (id: string, qty: number) => void
  updateCartPrice: (id: string, pricePaise: number) => void
  clearCart: () => void
  setCustomer: (info: Partial<CustomerInfo>) => void
  setSaleType: (t: string) => void
  setEmptyReceived: (v: string) => void
  setEmptyCount: (n: number) => void
  setDiscount: (paise: number) => void
  addPaymentRow: (method: string) => void
  removePaymentRow: (id: string) => void
  updatePayment: (id: string, field: 'method' | 'amount', value: string | number) => void
  resetSale: () => void
  getSubtotal: () => number
  getTotal: () => number
  getPaidTotal: () => number
  getBalance: () => number
}

const genId = () => Math.random().toString(36).slice(2, 10)

export const useSaleStore = create<SaleState>((set, get) => ({
  cart: [],
  customer: { name: '', consumerNumber: '', otp: '', phone: '' },
  saleType: SALE_TYPES[0],
  emptyReceived: 'No',
  emptyCount: 0,
  payments: [{ id: genId(), method: PAYMENT_METHODS[0], amount: 0 }],
  saleDiscount: 0,

  addToCart: (item) => set(state => ({ cart: [...state.cart, { ...item, id: genId() }] })),
  removeFromCart: (id) => set(state => ({ cart: state.cart.filter(c => c.id !== id) })),
  updateCartQty: (id, qty) => set(state => ({
    cart: state.cart.map(c => c.id === id ? { ...c, qty } : c)
  })),
  updateCartPrice: (id, pricePaise) => set(state => ({
    cart: state.cart.map(c => c.id === id ? { ...c, unitPrice: pricePaise } : c)
  })),
  clearCart: () => set({ cart: [] }),
  setCustomer: (info) => set(state => ({ customer: { ...state.customer, ...info } })),
  setSaleType: (t) => set({ saleType: t }),
  setEmptyReceived: (v) => set({ emptyReceived: v }),
  setEmptyCount: (n) => set({ emptyCount: n }),
  setDiscount: (paise) => set({ saleDiscount: paise }),
  addPaymentRow: (method) => set(state => ({
    payments: [...state.payments, { id: genId(), method, amount: 0 }]
  })),
  removePaymentRow: (id) => set(state => ({
    payments: state.payments.length > 1 ? state.payments.filter(p => p.id !== id) : state.payments
  })),
  updatePayment: (id, field, value) => set(state => ({
    payments: state.payments.map(p => p.id === id ? { ...p, [field]: value } : p)
  })),
  resetSale: () => set(state => ({
    cart: [],
    customer: { name: '', consumerNumber: '', otp: '', phone: '', noOtp: false },
    saleType: SALE_TYPES[0],
    emptyReceived: 'No',
    emptyCount: 0,
    payments: [{ id: genId(), method: PAYMENT_METHODS[0], amount: 0 }],
    saleDiscount: 0,
  })),
  getSubtotal: () => get().cart.reduce((sum, c) => sum + c.unitPrice * c.qty, 0),
  getTotal: () => get().getSubtotal() - get().saleDiscount,
  getPaidTotal: () => get().payments.reduce((sum, p) => sum + p.amount, 0),
  getBalance: () => get().getTotal() - get().getPaidTotal(),
}))
