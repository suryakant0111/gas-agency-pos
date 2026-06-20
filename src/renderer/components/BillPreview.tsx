import React from 'react'

interface BillPreviewProps {
  html: string
  onClose: () => void
  onPrint: () => void
  onSavePdf: () => void
}

const BillPreview: React.FC<BillPreviewProps> = ({ html, onClose, onPrint, onSavePdf }) => {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white text-dark-primary rounded-lg w-full max-w-lg max-h-[90vh] overflow-auto shadow-2xl"
           onClick={e => e.stopPropagation()}>
        <div dangerouslySetInnerHTML={{ __html: html }} className="p-4" />
        <div className="flex gap-3 p-4 border-t border-gray-200">
          <button className="btn-primary" onClick={onPrint}>Print</button>
          <button className="btn-success" onClick={onSavePdf}>Save PDF</button>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export default BillPreview
