import React, { useCallback, useEffect, useState } from 'react'

interface NumericKeypadProps {
  onChange: (value: number) => void
  onClose?: () => void
}

const NUMBERS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', '.']

const NumericKeypad: React.FC<NumericKeypadProps> = ({ onChange, onClose }) => {
  const [buffer, setBuffer] = useState('')

  const handleKey = useCallback((key: string) => {
    if (key === 'C') {
      setBuffer('')
      onChange(0)
    } else if (key === '.') {
      if (!buffer.includes('.')) {
        setBuffer(prev => prev + '.')
      }
    } else {
      const next = buffer + key
      setBuffer(next)
      const v = parseFloat(next)
      if (!isNaN(v)) onChange(Math.round(v * 100))
    }
  }, [buffer, onChange])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (NUMBERS.includes(e.key)) handleKey(e.key)
      if (e.key === 'Enter' || e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleKey, onClose])

  return (
    <div className="grid grid-cols-3 gap-1">
      {NUMBERS.map(key => (
        <button key={key}
          className={`py-3 rounded text-sm font-bold transition-colors ${
            key === 'C' ? 'btn-danger' : 'bg-dark-tertiary hover:bg-dark-border text-white'
          }`}
          onClick={() => handleKey(key)}>
          {key}
        </button>
      ))}
    </div>
  )
}

export default NumericKeypad
